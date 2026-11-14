// End-to-end check of the real app: drives the running app's web view over
// the DevTools protocol and calls the real Rust backend through it.
//
// Start the app with remote debugging first (PowerShell):
//   $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9222"
//   pnpm tauri dev
// then run:  node scripts/e2e-check.mjs
//
// It saves one test chart and folder and deletes them again. The only thing
// it leaves behind is a harmless settings entry named "e2e-test".

const targets = await (await fetch("http://127.0.0.1:9222/json")).json();
const page = targets.find((t) => t.type === "page");
if (!page) throw new Error("no page target found");

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.onopen = resolve;
  socket.onerror = reject;
});

let nextId = 1;
const pending = new Map();
socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  pending.get(message.id)?.(message);
  pending.delete(message.id);
};

/** Evaluate an async expression in the app's page and return its value. */
async function evaluate(expression) {
  const id = nextId++;
  const reply = new Promise((resolve) => pending.set(id, resolve));
  socket.send(
    JSON.stringify({
      id,
      method: "Runtime.evaluate",
      params: { expression, awaitPromise: true, returnByValue: true },
    }),
  );
  const { result } = await reply;
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? "evaluation failed");
  }
  return result.result.value;
}

const invoke = (command, args = {}) =>
  evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)}, ${JSON.stringify(args)})`);

const failures = [];
function check(label, condition, detail = "") {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures.push(label);
}

const orbs = { conjunction: 7, sextile: 7, square: 7, trine: 7, opposition: 7 };

const info = await invoke("app_info");
check("app_info", typeof info.version === "string", `version ${info.version}`);

const places = await invoke("places_search", { query: "køben" });
check(
  "place search finds København",
  places[0]?.name === "Copenhagen" && places[0]?.zone === "Europe/Copenhagen",
  `${places.length} results, first: ${places[0]?.name}`,
);

const sky = await invoke("sky_now", { latitude: 55.6761, longitude: 12.5683, orbs });
check("sky_now returns 12 positions", sky.chart.positions.length === 12);
check(
  "sky_now is the current time",
  Math.abs(Date.parse(sky.chart.utc) - Date.now()) < 60_000,
  sky.chart.utc,
);

const birth = {
  date: "1947-06-01",
  time: "12:00",
  latitude: 55.6759,
  longitude: 12.5655,
  zone: "Europe/Copenhagen",
  offsetSeconds: null,
};
const resolved = await invoke("birth_resolve", { birth });
check("Danish summer time 1947", resolved.offsetSeconds === 7200, `offset ${resolved.offsetSeconds}`);

const lotOptions = { sectOverride: null, orb: 3, exactOrb: 1 };
const computed = await invoke("chart_compute", { birth, orbs, lots: lotOptions });
const sun = computed.chart.positions.find((p) => p.body === "sun");
check("chart_compute: Sun in Gemini on 1 June", sun.sign === "gemini", `${sun.degree}°${sun.minute}′`);
check("chart_compute returns aspects", computed.aspects.length > 0, `${computed.aspects.length} aspects`);

// Lots: recompute Fortune and Spirit here from the returned positions.
const longitude = (body) => computed.chart.positions.find((p) => p.body === body).longitude;
const mod360 = (x) => ((x % 360) + 360) % 360;
const near = (a, b) => Math.abs(mod360(a - b + 180) - 180) < 1e-6;
const asc = computed.chart.angles.ascendant.longitude;
const dayFortune = mod360(asc + longitude("moon") - longitude("sun"));
const daySpirit = mod360(asc + longitude("sun") - longitude("moon"));
const lotOf = (result, lot) => result.lots.positions.find((p) => p.lot === lot);
check("sky_now has no lots", sky.lots === null);
check(
  "chart_compute returns seven lots",
  computed.lots.positions.map((p) => p.lot).join() ===
    "fortune,spirit,eros,necessity,courage,victory,nemesis",
);
check(
  "noon in June is a day chart, not overridden",
  computed.chart.sect === "day" && computed.lots.sect === "day" && computed.lots.overridden === false,
);
check(
  "day Fortune = ASC + Moon − Sun, Spirit = ASC + Sun − Moon",
  near(lotOf(computed, "fortune").longitude, dayFortune) &&
    near(lotOf(computed, "spirit").longitude, daySpirit),
  `Fortune ${lotOf(computed, "fortune").longitude.toFixed(4)}`,
);
const fortune = lotOf(computed, "fortune");
const fortuneRuler = computed.chart.positions.find((p) => p.body === fortune.ruler);
check(
  "lot overview gives the ruler's sign and house",
  fortune.planet === "moon" &&
    fortune.rulerSign === fortuneRuler.sign &&
    fortune.rulerHouse === fortuneRuler.house,
  `ruler ${fortune.ruler} in ${fortune.rulerSign}, house ${fortune.rulerHouse}`,
);

const night = await invoke("chart_compute", {
  birth,
  orbs,
  lots: { ...lotOptions, sectOverride: "night" },
});
check(
  "manual night sect swaps Fortune and Spirit",
  night.lots.sect === "night" &&
    night.lots.overridden === true &&
    night.chart.sect === "day" &&
    near(lotOf(night, "fortune").longitude, daySpirit) &&
    near(lotOf(night, "spirit").longitude, dayFortune),
);
check(
  "manual night sect recalculates the other five",
  ["eros", "necessity", "courage", "victory", "nemesis"].every(
    (lot) => !near(lotOf(night, lot).longitude, lotOf(computed, lot).longitude),
  ),
);

const wide = await invoke("chart_compute", { birth, orbs, lots: { ...lotOptions, orb: 10, exactOrb: 2 } });
check(
  "lot aspects stay within the orb",
  computed.lots.aspects.every((a) => a.orb <= 3) &&
    wide.lots.aspects.length > computed.lots.aspects.length &&
    wide.lots.aspects.every((a) => a.orb <= 10),
  `${computed.lots.aspects.length} at 3°, ${wide.lots.aspects.length} at 10°`,
);
check(
  "exact marker follows the limit",
  computed.lots.aspects.every((a) => a.exact === a.orb < 1) &&
    wide.lots.aspects.every((a) => a.exact === a.orb < 2),
);

// Profections: born 1 June 1947 at 12:00 in Copenhagen (summer time, UTC+2).
const profectionOptions = { yearStart: "birthClockTime", leapDay: "february28" };
const rising = computed.chart.houses[0];
const at = "2001-01-01T00:00:00Z";
const year53 = await invoke("profection_year", { birth, options: profectionOptions, age: null, at });
check(
  "profection_year finds the year holding a moment",
  year53.currentAge === 53 && year53.year.age === 53 && year53.currentMonth === 8,
  `age ${year53.currentAge}, month ${year53.currentMonth}`,
);
check(
  "profection year runs from birthday to birthday at the birth clock time",
  year53.year.start.utc === "2000-06-01T10:00:00Z" &&
    year53.year.end.utc === "2001-06-01T10:00:00Z" &&
    year53.year.start.local === "2000-06-01T12:00:00",
  `${year53.year.start.utc} – ${year53.year.end.utc}`,
);
const year48 = await invoke("profection_year", { birth, options: profectionOptions, age: 48, at });
check(
  "age 0, 12, 24 … return to house 1 with the rising sign's ruler as Time Lord",
  year48.year.house === 1 && year48.year.sign === rising.sign && year48.year.timeLord === rising.ruler,
  `${year48.year.sign}, ${year48.year.timeLord}`,
);
check(
  "age 53 is house 6, and its months run through houses 6…12, 1…5",
  year53.year.house === 6 &&
    year53.year.sign === computed.chart.houses[5].sign &&
    year53.year.timeLord === computed.chart.houses[5].ruler &&
    year53.year.months.map((m) => m.house).join() === "6,7,8,9,10,11,12,1,2,3,4,5" &&
    year53.year.months.every((m) => m.sign === computed.chart.houses[m.house - 1].sign),
);
const monthMs = year53.year.months.map((m) => Date.parse(m.end.utc) - Date.parse(m.start.utc));
check(
  "12 equal months tile the year with no gap or overlap",
  monthMs.every((ms) => ms === monthMs[0]) &&
    monthMs[0] * 12 === Date.parse(year53.year.end.utc) - Date.parse(year53.year.start.utc) &&
    year53.year.months[0].start.utc === year53.year.start.utc &&
    year53.year.months[11].end.utc === year53.year.end.utc &&
    year53.year.months.every((m, i, all) => i === 0 || all[i - 1].end.utc === m.start.utc),
  `${monthMs[0] / 3_600_000} hours each`,
);
check("a year the moment is not in has no current month", year48.currentMonth === null && year48.currentAge === 53);
const midnight = await invoke("profection_year", {
  birth,
  options: { ...profectionOptions, yearStart: "midnight" },
  age: 53,
  at,
});
check("midnight rule starts at 00:00 local time", midnight.year.start.local === "2000-06-01T00:00:00");
const solar = await invoke("profection_year", {
  birth,
  options: { ...profectionOptions, yearStart: "solarReturn" },
  age: 53,
  at,
});
const returnChart = await invoke("chart_compute", {
  birth: { ...birth, zone: null, offsetSeconds: 0, date: solar.year.start.utc.slice(0, 10), time: solar.year.start.utc.slice(11, 16) },
  orbs,
  lots: lotOptions,
});
const returnSun = returnChart.chart.positions.find((p) => p.body === "sun").longitude;
check(
  "solar return rule starts when the Sun is back at its natal longitude",
  // The check chart is computed for the whole minute before the return.
  Math.abs(mod360(returnSun - sun.longitude + 180) - 180) < 0.001 &&
    Math.abs(Date.parse(solar.year.start.utc) - Date.parse("2000-06-01T10:00:00Z")) < 2 * 86_400_000,
  solar.year.start.utc,
);
const leap = await invoke("profection_year", {
  birth: { ...birth, date: "1960-02-29", time: "08:00" },
  options: { ...profectionOptions, leapDay: "march1" },
  age: 1,
  at,
});
check("29 February birth with the 1 March rule", leap.year.start.local === "1961-03-01T08:00:00", leap.year.start.local);
const noTime = await invoke("profection_year", { birth: { ...birth, time: null }, options: profectionOptions, age: 1, at });
check("unknown birth time is flagged and noon is used", noTime.timeAssumed === true && noTime.year.start.local === "1948-06-01T12:00:00");
const tooOld = await invoke("profection_year", { birth, options: profectionOptions, age: 151, at }).then(
  () => null,
  (error) => String(error),
);
check("an age beyond the limit is rejected", tooOld !== null, tooOld ?? "no error");

const manual = await invoke("birth_resolve", { birth: { ...birth, zone: null, offsetSeconds: 3600 } });
check("manual offset overrides zone", manual.utc === "1947-06-01T11:00:00Z", manual.utc);

const badTime = await invoke("birth_resolve", {
  birth: { ...birth, date: "2020-03-29", time: "02:30" },
}).then(
  () => null,
  (error) => String(error),
);
check("skipped clock hour is rejected", badTime !== null, badTime ?? "no error");

const before = (await invoke("charts_list")).length;
const folder = await invoke("folder_create", { name: "e2e-test-mappe" });
const saved = await invoke("chart_save", {
  chart: {
    id: null,
    name: "e2e-test",
    folderId: folder.id,
    birthDate: birth.date,
    birthTime: birth.time,
    placeName: "Copenhagen",
    countryCode: "DK",
    latitude: birth.latitude,
    longitude: birth.longitude,
    zone: birth.zone,
    offsetSeconds: null,
    featured: false,
    sectOverride: null,
  },
});
check("chart_save assigns an id", Number.isInteger(saved.id));
const overridden = await invoke("chart_save", { chart: { ...saved, sectOverride: "night" } });
const reread = (await invoke("charts_list")).find((c) => c.id === saved.id);
check(
  "sect override is stored with the chart",
  overridden.sectOverride === "night" && reread?.sectOverride === "night",
);
const cleared = await invoke("chart_save", { chart: { ...saved, sectOverride: null } });
check("sect override can be cleared", cleared.sectOverride === null);
check("charts_list grows by one", (await invoke("charts_list")).length === before + 1);

await invoke("folder_delete", { id: folder.id });
const afterFolderDelete = (await invoke("charts_list")).find((c) => c.id === saved.id);
check("deleting the folder keeps the chart", afterFolderDelete?.folderId === null);

await invoke("chart_delete", { id: saved.id });
check("chart_delete restores the list", (await invoke("charts_list")).length === before);

await invoke("setting_set", { key: "e2e-test", value: "1" });
check("settings round-trip", (await invoke("setting_get", { key: "e2e-test" })) === "1");

const text = await evaluate("document.body.innerText");
check("start screen is rendered", text.includes("Himlen lige nu") && text.includes("Udvalgte horoskoper"));
const wheel = await evaluate("document.querySelectorAll('svg.chart-wheel text').length");
check("the wheel is drawn", wheel > 40, `${wheel} text elements`);

socket.close();
console.log(failures.length === 0 ? "\nAll checks passed." : `\n${failures.length} check(s) failed.`);
process.exit(failures.length === 0 ? 0 : 1);
