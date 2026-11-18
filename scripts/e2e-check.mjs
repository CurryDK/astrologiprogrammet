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

// Transits and Live Chart. Times are shown and stepped in a named zone.
const zone = "Europe/Copenhagen";
const liveArgs = {
  birth,
  zone,
  orb: 3,
  profections: profectionOptions,
  step: null,
  progression: { orb: 1, angleMethod: "naibodRightAscension" },
};
const atBirth = await invoke("live_chart", { ...liveArgs, at: "1947-06-01T10:00:00Z" });
check(
  "live_chart at the birth moment: every body is conjunct itself",
  computed.chart.positions.every((p) =>
    atBirth.toNatal.some(
      (a) => a.transit === p.body && a.natal === p.body && a.kind === "conjunction" && a.orb < 1e-6,
    ),
  ) && atBirth.toNatal.every((a) => a.orb <= 3),
  `${atBirth.toNatal.length} aspects`,
);
check(
  "live_chart shows the moment in the asked zone",
  atBirth.at.local === "1947-06-01T12:00:00" && atBirth.at.offsetSeconds === 7200,
  atBirth.at.local,
);
const live = await invoke("live_chart", { ...liveArgs, at });
check(
  "live_chart: age and profection follow the shown moment",
  live.age === 53 &&
    live.profection.timeLord === year53.year.timeLord &&
    live.profectionMonth === 8 &&
    live.positions.length === 12,
  `age ${live.age}, month ${live.profectionMonth}`,
);
const liveSun = live.positions.find((p) => p.body === "sun");
check(
  "transit positions carry the natal whole-sign house",
  live.positions.every((p) => computed.chart.houses[p.house - 1].sign === p.sign) &&
    liveSun.sign === "capricorn",
  `Sun in ${liveSun.sign}, natal house ${liveSun.house}`,
);
check(
  "transit → transit holds bodies only, each pair once",
  live.toTransit.every((a) => a.a !== "ascendant" && a.b !== "midheaven" && a.orb <= 3) &&
    new Set(live.toTransit.map((a) => `${a.a}-${a.b}`)).size === live.toTransit.length,
  `${live.toTransit.length} aspects`,
);
const stepTo = async (from, unit, count) =>
  (await invoke("live_chart", { ...liveArgs, at: from, step: { unit, count } })).at;
const dayOn = await stepTo("2020-03-28T11:00:00Z", "day", 1);
const monthOn = await stepTo("2023-01-31T11:00:00Z", "month", 1);
const minuteBack = await stepTo("2020-03-28T11:00:00Z", "minute", -1);
check(
  "a day step keeps the clock time across the change to summer time",
  dayOn.utc === "2020-03-29T10:00:00Z" && dayOn.local === "2020-03-29T12:00:00",
  dayOn.utc,
);
check("a month step stops at the month's last day", monthOn.local === "2023-02-28T12:00:00", monthOn.local);
check("a minute step back", minuteBack.utc === "2020-03-28T10:59:00Z", minuteBack.utc);

const sunReturn = await invoke("transit_passes", {
  birth,
  transit: "sun",
  other: { natal: "sun" },
  kind: "conjunction",
  at: "2000-06-02T00:00:00Z",
  zone,
});
check(
  "exact pass of the Sun over the natal Sun is the solar return found by the profections",
  sunReturn.length === 1 &&
    Math.abs(Date.parse(sunReturn[0].utc) - Date.parse(solar.year.start.utc)) < 2000,
  sunReturn.map((m) => m.utc).join(", "),
);
const newMoon = await invoke("transit_passes", {
  birth,
  transit: "moon",
  other: { transit: "sun" },
  kind: "conjunction",
  at: "2024-04-08T06:00:00Z",
  zone,
});
check(
  "exact pass between two transiting bodies: new moon of 8 April 2024, 18:21 UTC",
  newMoon.length === 1 && Math.abs(Date.parse(newMoon[0].utc) - Date.parse("2024-04-08T18:21:00Z")) < 120_000,
  newMoon.map((m) => m.utc).join(", "),
);
// Mercury was retrograde 23 Aug – 15 Sep 2023 between about 22° and 8° Virgo.
// Find a natal point it crossed three times, if this chart has one in range.
const mercuryNatal = [...computed.chart.positions.map((p) => [p.body, p.longitude]),
  ["ascendant", computed.chart.angles.ascendant.longitude]];
const retroPasses = [];
for (const [point, lon] of mercuryNatal) {
  for (const [kind, angle] of [["conjunction", 0], ["sextile", 60], ["square", 90], ["trine", 120], ["opposition", 180]]) {
    for (const side of [1, -1]) {
      const target = mod360(lon + side * angle);
      if (target > 159 && target < 171) retroPasses.push({ point, kind });
    }
  }
}
if (retroPasses.length > 0) {
  const { point, kind } = retroPasses[0];
  const passes = await invoke("transit_passes", {
    birth,
    transit: "mercury",
    other: { natal: point },
    kind,
    at: "2023-09-01T00:00:00Z",
    zone,
  });
  check(
    `retrograde Mercury makes three passes (${kind} to natal ${point})`,
    passes.length === 3 && passes[0].utc < "2023-08-23" && passes[2].utc > "2023-09-15",
    passes.map((m) => m.local.slice(0, 16)).join(", "),
  );
} else {
  console.log("skip retrograde passes: no natal point in Mercury's 2023 retrograde zone");
}

const skyAt = await invoke("sky_at", {
  at: "2000-01-01T12:00:00Z",
  step: null,
  zone,
  latitude: 55.6761,
  longitude: 12.5683,
  orbs,
});
const skySun = skyAt.computed.chart.positions.find((p) => p.body === "sun");
check(
  "sky_at a chosen moment: Sun at 10° Capricorn on 1 January 2000",
  skySun.sign === "capricorn" && skySun.degree === 10 && skyAt.at.local === "2000-01-01T13:00:00",
  `${skySun.degree}°${skySun.minute}′, ${skyAt.at.local}`,
);
const skyStepped = await invoke("sky_at", {
  at: "2000-01-01T12:00:00Z",
  step: { unit: "week", count: -1 },
  zone,
  latitude: 55.6761,
  longitude: 12.5683,
  orbs,
});
check("sky_at steps a week back", skyStepped.at.utc === "1999-12-25T12:00:00Z", skyStepped.at.utc);
const localNoon = await invoke("local_resolve", { date: "1975-06-14", time: null, zone });
check(
  "local_resolve: a date without a clock time is taken at 12:00 and flagged",
  localNoon.utc === "1975-06-14T11:00:00Z" && localNoon.timeAssumed === true,
  localNoon.utc,
);

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

// Solar Return: the exact return of the Sun, the active year, place and sect per year.
const returnArgs = { chartId: saved.id, orbs, lotOrb: 3, lotExactOrb: 1 };
const sunOf = (result) => result.computed.chart.positions.find((p) => p.body === "sun").longitude;
const return30 = await invoke("solar_return", { ...returnArgs, age: 30 });
check(
  "solar_return: the Sun is back at its natal longitude",
  Math.abs(mod360(sunOf(return30) - longitude("sun") + 180) - 180) < 1e-6,
  `natal ${longitude("sun")}, return ${sunOf(return30)}`,
);
check(
  "solar_return: return 30 falls within a day and a half of the 30th birthday",
  Math.abs(Date.parse(return30.moment.utc) - Date.parse("1977-06-01T10:00:00Z")) < 36 * 3600 * 1000,
  return30.moment.local,
);
check(
  "solar_return: birthplace, own lots and the natal profection's Lord of the Year",
  return30.place.changed === false &&
    return30.place.name === "Copenhagen" &&
    return30.computed.lots?.positions.length === 7 &&
    return30.timeAssumed === false &&
    return30.timeLord === computed.chart.houses[30 % 12].ruler,
  `time lord ${return30.timeLord}`,
);
const activeReturn = await invoke("solar_return", { ...returnArgs, age: null });
const nextReturn = await invoke("solar_return", { ...returnArgs, age: activeReturn.age + 1 });
check(
  "solar_return: without an age the latest return that has occurred is shown",
  activeReturn.age === activeReturn.activeAge &&
    Date.parse(activeReturn.moment.utc) <= Date.now() &&
    Date.parse(nextReturn.moment.utc) > Date.now(),
  `age ${activeReturn.age}: ${activeReturn.moment.local}, next ${nextReturn.moment.local}`,
);
const paris = { name: "Paris", countryCode: "FR", latitude: 48.8566, longitude: 2.3522, zone: "Europe/Paris" };
await invoke("solar_return_set", { chartId: saved.id, age: 30, choice: { place: paris, sectOverride: null } });
const inParis = await invoke("solar_return", { ...returnArgs, age: 30 });
const return31 = await invoke("solar_return", { ...returnArgs, age: 31 });
check(
  "solar_return: a changed place moves the angles, not the moment, and only for that year",
  inParis.place.changed === true &&
    inParis.place.name === "Paris" &&
    inParis.moment.utc === return30.moment.utc &&
    inParis.computed.chart.angles.ascendant.longitude !== return30.computed.chart.angles.ascendant.longitude &&
    return31.place.changed === false &&
    (await invoke("charts_list")).find((c) => c.id === saved.id)?.placeName === "Copenhagen",
  `ASC ${return30.computed.chart.angles.ascendant.longitude} -> ${inParis.computed.chart.angles.ascendant.longitude}`,
);
const otherReturnSect = inParis.computed.chart.sect === "day" ? "night" : "day";
await invoke("solar_return_set", {
  chartId: saved.id,
  age: 30,
  choice: { place: paris, sectOverride: otherReturnSect },
});
const returnSect = await invoke("solar_return", { ...returnArgs, age: 30 });
check(
  "solar_return: a manual sect is the return's own and leaves the natal sect alone",
  returnSect.sectOverride === otherReturnSect &&
    returnSect.computed.lots.sect === otherReturnSect &&
    returnSect.computed.lots.overridden === true &&
    returnSect.place.changed === true &&
    (await invoke("charts_list")).find((c) => c.id === saved.id)?.sectOverride === null,
);
const returnCondition = await invoke("planetary_condition_at", {
  cast: {
    utc: inParis.moment.utc,
    latitude: inParis.place.latitude,
    longitude: inParis.place.longitude,
    zone: inParis.place.zone,
    offsetSeconds: inParis.place.offsetSeconds,
  },
  sectOverride: null,
  options: { cazimi: 1, combust: 8, beams: 15 },
});
const returnSunHouse = inParis.computed.chart.positions.find((p) => p.body === "sun").house;
check(
  "planetary_condition_at uses the return chart's own sect and houses",
  returnCondition.planets.length === 7 &&
    returnCondition.sect === inParis.computed.chart.sect &&
    returnCondition.planets.find((p) => p.body === "sun").house === returnSunHouse,
  `sect ${returnCondition.sect}, Sun in house ${returnSunHouse}`,
);
await invoke("solar_return_set", { chartId: saved.id, age: 30, choice: { place: null, sectOverride: null } });
const returnReset = await invoke("solar_return", { ...returnArgs, age: 30 });
check(
  "solar_return: the place can be reset to the birthplace",
  returnReset.place.changed === false &&
    returnReset.sectOverride === null &&
    returnReset.computed.chart.angles.ascendant.longitude === return30.computed.chart.angles.ascendant.longitude,
);
const badPlace = await invoke("solar_return_set", {
  chartId: saved.id,
  age: 30,
  choice: { place: { ...paris, zone: "Mars/Olympus" }, sectOverride: null },
}).then(
  () => null,
  (e) => String(e),
);
check("solar_return_set refuses an unknown time zone", badPlace !== null, badPlace ?? "");
const untimedChart = await invoke("chart_save", { chart: { ...saved, id: null, name: "e2e-uden-tid", birthTime: null } });
const limitedReturn = await invoke("solar_return", { ...returnArgs, chartId: untimedChart.id, age: 30 });
check(
  "solar_return: without a birth time there are no lots and no Lord of the Year",
  limitedReturn.timeAssumed === true && limitedReturn.computed.lots === null && limitedReturn.timeLord === null,
);
await invoke("chart_delete", { id: untimedChart.id });

// Event search, aspect courses and synodic cycles. These run on a worker
// thread, which must find the ephemeris data files too.
const searchBase = {
  start: "2026-01-01T00:00:00Z",
  end: "2027-01-01T00:00:00Z",
  transitBodies: [],
  progressedPoints: [],
  natalPoints: [],
  aspectKinds: ["conjunction", "sextile", "square", "trine", "opposition"],
  transitToNatal: false,
  transitToTransit: false,
  progressedToNatal: false,
  progressedToProgressed: false,
  transitSignChanges: false,
  transitStations: false,
  progressedSignChanges: false,
  progressedStations: false,
  progressedMoonHouses: false,
  progressedAngleSigns: false,
  lunationsMajor: false,
  lunationsMinor: false,
  progressedBounds: false,
  progressedDecans: false,
  angleMethod: "naibodRightAscension",
  birthTimeKnown: true,
};
const ingress = await invoke("event_search", {
  birth,
  options: { ...searchBase, transitBodies: ["sun"], transitSignChanges: true },
  zone: "UTC",
});
const aries = ingress.events.find((e) => e.type === "signChange" && e.sign === "aries");
check(
  "event_search: the Sun enters 12 signs in a year, Aries at the published equinox of 20 March 2026 14:46 UTC",
  ingress.events.length === 12 &&
    aries !== undefined &&
    Math.abs(Date.parse(aries.utc) - Date.parse("2026-03-20T14:46:00Z")) < 2 * 60 * 1000,
  `${ingress.events.length} events; Aries at ${aries?.at.local}`,
);
const returnSearch = await invoke("event_search", {
  birth,
  options: {
    ...searchBase,
    transitBodies: ["sun"],
    natalPoints: ["sun"],
    transitToNatal: true,
    aspectKinds: ["conjunction"],
  },
  zone: "UTC",
});
check(
  "event_search: the transiting Sun meets the natal Sun at the Solar Return",
  returnSearch.events.length === 1 &&
    Math.abs(Date.parse(returnSearch.events[0].utc) - Date.parse(activeReturn.moment.utc)) < 2000 &&
    returnSearch.events[0].a.layer === "transit" &&
    returnSearch.events[0].b.layer === "natal",
  returnSearch.events[0]?.at.local,
);
const progressedSearch = await invoke("event_search", {
  birth,
  options: {
    ...searchBase,
    start: "1990-01-01T00:00:00Z",
    end: "2020-01-01T00:00:00Z",
    progressedPoints: ["moon", "ascendant"],
    natalPoints: ["sun"],
    progressedToNatal: true,
    progressedSignChanges: true,
    progressedMoonHouses: true,
    progressedAngleSigns: true,
    lunationsMajor: true,
  },
  zone: "UTC",
});
const typesFound = new Set(progressedSearch.events.map((e) => e.type));
const ordered = progressedSearch.events.every(
  (e, i, all) => i === 0 || Date.parse(all[i - 1].utc) <= Date.parse(e.utc),
);
check(
  "event_search: progressed aspects, sign and house changes and lunation phases, in time order, none to a transit",
  ["aspect", "signChange", "moonHouse", "lunation"].every((type) => typesFound.has(type)) &&
    ordered &&
    progressedSearch.events.every((e) => e.type !== "aspect" || (e.a.layer === "progressed" && e.b.layer === "natal")),
  `${progressedSearch.events.length} events: ${[...typesFound].join(", ")}`,
);
const tooLong = await invoke("event_search", {
  birth,
  options: { ...searchBase, end: "2046-01-01T00:00:00Z", transitBodies: ["sun"], transitSignChanges: true },
  zone: "UTC",
}).then(
  () => null,
  (e) => String(e),
);
check("event_search refuses a transit period that is too long", tooLong !== null, tooLong ?? "");

const courseAt = new Date(Date.parse(activeReturn.moment.utc) - 3 * 86_400_000).toISOString();
const courseReply = await invoke("aspect_courses", {
  birth,
  options: {
    at: courseAt,
    start: courseAt,
    end: courseAt,
    transitBodies: ["sun"],
    progressedPoints: [],
    natalPoints: ["sun"],
    aspectKinds: ["conjunction"],
    transitToNatal: true,
    transitToTransit: false,
    progressedToNatal: false,
    progressedToProgressed: false,
    transitOrb: 7,
    progressedOrb: 1,
    angleMethod: "naibodRightAscension",
    birthTimeKnown: true,
  },
  zone: "UTC",
});
const course = courseReply.courses[0];
check(
  "aspect_courses: three days before the Solar Return the Sun is applying, enters the orb before and leaves it after exact",
  courseReply.courses.length === 1 &&
    course.applying === true &&
    Math.abs(course.orb - 3) < 0.3 &&
    course.exact.length === 1 &&
    Math.abs(Date.parse(course.exact[0].utc) - Date.parse(activeReturn.moment.utc)) < 2000 &&
    course.periods.length === 1 &&
    Date.parse(course.periods[0].enter.utc) < Date.parse(courseAt) &&
    Date.parse(course.periods[0].leave.utc) > Date.parse(course.exact[0].utc) &&
    Math.abs(course.daysInOrb - 14) < 1.5,
  `orb ${course?.orb}, ${course?.periods[0]?.enter?.local} – ${course?.periods[0]?.leave?.local}, ${course?.daysInOrb} days`,
);

const synodic = await invoke("synodic_cycles", { at: "2025-02-10T00:00:00Z", zone: "UTC" });
const marsCycle = synodic.cycles.find((c) => c.body === "mars");
const venusCycle = synodic.cycles.find((c) => c.body === "venus");
check(
  "synodic_cycles: Mars opposite the Sun on 16 January 2025, Venus at inferior conjunction on 23 March 2025",
  synodic.cycles.length === 8 &&
    marsCycle.lastOpposition.at.local.startsWith("2025-01-16") &&
    marsCycle.lastOpposition.days < 0 &&
    venusCycle.nextConjunction.kind === "inferiorConjunction" &&
    venusCycle.nextConjunction.at.local.startsWith("2025-03-23") &&
    venusCycle.lastOpposition === null,
  `Mars ${marsCycle?.lastOpposition?.at.local}, Venus ${venusCycle?.nextConjunction?.at.local}`,
);

const retro = await invoke("retrograde_cycles", { at: "2025-03-20T12:00:00Z", zone: "UTC" });
const mercuryRetro = retro.planets.find((p) => p.body === "mercury");
const mercuryNow = mercuryRetro?.cycles.find((c) => c.status === "current");
const retroDay = (kind) => mercuryNow?.events.find((e) => e.kind === kind)?.at.local.slice(0, 10);
check(
  "retrograde_cycles: Mercury retrograde 15 March to 7 April 2025, in Aries, back into Pisces and out again",
  retro.planets.length === 8 &&
    mercuryRetro.phase === "retrograde" &&
    mercuryNow.sign === "aries" &&
    retroDay("stationRetrograde") === "2025-03-15" &&
    retroDay("stationDirect") === "2025-04-07" &&
    mercuryNow.events.map((e) => e.kind).join() ===
      "shadowEntry,signEntry,stationRetrograde,signChange,stationDirect,signReentry,shadowExit,signExit" &&
    mercuryNow.events.filter((e) => e.nearest).map((e) => e.kind).join() === "stationRetrograde,signChange" &&
    mercuryRetro.lastRetrogradeStation.at.utc === mercuryNow.events[2].at.utc,
  `${mercuryRetro?.phase}, ${retroDay("stationRetrograde")} – ${retroDay("stationDirect")}`,
);

// Life events: only what is known is stored.
const blankEvent = { id: null, chartId: saved.id, title: "", year: 1975, month: null, day: null, time: null, zone, note: "" };
const wedding = await invoke("event_save", {
  event: { ...blankEvent, title: "e2e bryllup", month: 6, day: 14, time: "14:00" },
});
const yearOnly = await invoke("event_save", { event: { ...blankEvent, title: "e2e flytning" } });
const monthOnly = await invoke("event_save", { event: { ...blankEvent, title: "e2e job", month: 6 } });
const listed = await invoke("events_list", { chartId: saved.id });
check(
  "life events are stored with exactly the precision given",
  listed.map((e) => e.title).join() === "e2e flytning,e2e job,e2e bryllup" &&
    listed[0].month === null && listed[0].day === null && listed[0].time === null &&
    listed[1].month === 6 && listed[1].day === null &&
    listed[2].day === 14 && listed[2].time === "14:00",
  listed.map((e) => `${e.year}-${e.month}-${e.day} ${e.time}`).join(" | "),
);
const edited = await invoke("event_save", { event: { ...wedding, time: null, note: "ukendt tid" } });
check("a life event can be edited", edited.id === wedding.id && edited.time === null && edited.note === "ukendt tid");
const rejects = async (event) =>
  invoke("event_save", { event }).then(
    () => false,
    () => true,
  );
check(
  "impossible life events are rejected",
  (await rejects({ ...blankEvent, title: "x", day: 3 })) &&
    (await rejects({ ...blankEvent, title: "x", month: 2, day: 30 })) &&
    (await rejects({ ...blankEvent, title: "x", month: 6, time: "10:00" })) &&
    (await rejects({ ...blankEvent, title: " " })),
);
await invoke("event_delete", { id: yearOnly.id });
check("event_delete removes one event", (await invoke("events_list", { chartId: saved.id })).length === 2);

// Import from Solar Fire: a file built here in its layout (see
// crates/astro-core/src/solarfire.rs), with one chart and one life event.
function solarFireFile() {
  const bytes = [];
  const text = (value, length) => bytes.push(...Buffer.from(value.padEnd(length, " "), "latin1"));
  const number = (kind, value) => {
    const buffer = Buffer.alloc(kind === "i16" ? 2 : 4);
    if (kind === "f32") buffer.writeFloatLE(value);
    else if (kind === "u32") buffer.writeUInt32LE(value);
    else buffer.writeInt16LE(value);
    bytes.push(...buffer);
  };
  const moment = (name, [year, month, day, hour, minute], hoursWest) => {
    text(name, 50);
    text("Hillerød", 20);
    text("Denmark", 20);
    number("f32", -12.3167);
    number("f32", 55.9333);
    number("i16", year);
    bytes.push(month, day, hour, minute, 0);
    number("f32", hoursWest);
    text("CET", 5);
  };
  bytes.push(3, 0);
  text("e2e", 80);
  number("u32", 1);
  bytes.push(1, 1);
  moment("e2e-solarfire", [1967, 8, 20, 13, 15], -1);
  bytes.push(0, 2);
  text("AA", 2);
  text("", 30);
  bytes.push(...new Array(142).fill(0));
  number("u32", 1);
  moment("e2e separeret", [2012, 6, 21, 10, 30], 0);
  bytes.push(0);
  number("u32", 0);
  number("u32", 0);
  return bytes;
}
const sfBytes = solarFireFile();
const sfFile = await invoke("solar_fire_read", { bytes: sfBytes });
const sfChart = sfFile.charts[0];
check(
  "solar_fire_read shows the chart as it would be imported",
  sfFile.charts.length === 1 &&
    sfChart.name === "e2e-solarfire" &&
    sfChart.birthDate === "1967-08-20" &&
    sfChart.birthTime === "13:15" &&
    sfChart.placeName === "Hillerød" &&
    sfChart.zone === "Europe/Copenhagen" &&
    sfChart.offsetSeconds === null &&
    sfChart.problem === null &&
    sfChart.inArchive === false,
  JSON.stringify({ ...sfChart, events: sfChart.events.length }),
);
const sfSummary = await invoke("solar_fire_import", {
  bytes: sfBytes,
  folder: "E2E-test-mappe",
  selected: [0],
});
const sfSaved = (await invoke("charts_list")).find((c) => c.name === "e2e-solarfire");
const sfEvents = sfSaved ? await invoke("events_list", { chartId: sfSaved.id }) : [];
check(
  "solar_fire_import saves the chart in the existing folder with its life event",
  sfSummary.charts === 1 &&
    sfSummary.events === 1 &&
    sfSummary.folderId === folder.id &&
    sfSaved?.folderId === folder.id &&
    sfSaved?.countryCode === "DK" &&
    sfEvents.length === 1 &&
    // 10:30 UT read on the Copenhagen clock.
    sfEvents[0].time === "12:30" &&
    sfEvents[0].zone === "Europe/Copenhagen",
  JSON.stringify(sfEvents),
);
check(
  "an imported chart is recognised the next time the file is read",
  (await invoke("solar_fire_read", { bytes: sfBytes })).charts[0].inArchive === true,
);
if (sfSaved) await invoke("chart_delete", { id: sfSaved.id });

await invoke("folder_delete", { id: folder.id });
const afterFolderDelete = (await invoke("charts_list")).find((c) => c.id === saved.id);
check("deleting the folder keeps the chart", afterFolderDelete?.folderId === null);

await invoke("chart_delete", { id: saved.id });
check(
  "deleting the chart deletes its life events",
  (await invoke("events_list", { chartId: saved.id })).length === 0 && monthOnly.id > 0,
);
check("chart_delete restores the list", (await invoke("charts_list")).length === before);

await invoke("setting_set", { key: "e2e-test", value: "1" });
check("settings round-trip", (await invoke("setting_get", { key: "e2e-test" })) === "1");

const text = await evaluate("document.body.innerText");
check("start screen is rendered", text.includes("Himlen lige nu") && text.includes("Udvalgte horoskoper"));
const wheel = await evaluate("document.querySelectorAll('svg.chart-wheel text').length");
check("the wheel is drawn", wheel > 40, `${wheel} text elements`);

// Planetary Condition: seven planets, the manual sect, and the Sun limits.
const conditionOptions = { cazimi: 1, combust: 8, beams: 15 };
const condition = await invoke("planetary_condition", { birth, sectOverride: null, options: conditionOptions });
check(
  "planetary_condition covers the seven traditional planets",
  condition.planets.map((p) => p.body).join() === "sun,moon,mercury,venus,mars,jupiter,saturn",
);
check(
  "planetary_condition: Mercury is in its domicile in Gemini on 1 June 1947",
  (() => {
    const mercury = condition.planets.find((p) => p.body === "mercury");
    return mercury.sign !== "gemini" || mercury.conditions.some((c) => c.kind === "domicile");
  })(),
);
check(
  "planetary_condition uses the chart's own sect",
  condition.sect === computed.chart.sect && condition.overridden === false,
  condition.sect,
);
check(
  "planetary_condition gives stations for Mercury to Saturn",
  condition.stations.length === 5 && condition.stations.every((s) => s.previous && s.next),
);
const otherSect = condition.sect === "day" ? "night" : "day";
const flipped = await invoke("planetary_condition", { birth, sectOverride: otherSect, options: conditionOptions });
const rated = (report) =>
  JSON.stringify(
    report.planets.map((p) =>
      p.conditions
        .filter((c) => c.group === "bonification" || c.group === "maltreatment")
        .map((c) => [c.kind, c.others, c.rating]),
    ),
  );
check(
  "planetary_condition: a manual sect is marked and changes no bonification/maltreatment rating",
  flipped.overridden === true && flipped.sect === otherSect && rated(flipped) === rated(condition),
);
const badLimits = await invoke("planetary_condition", {
  birth,
  sectOverride: null,
  options: { cazimi: 9, combust: 8, beams: 15 },
}).then(
  () => null,
  (error) => String(error),
);
check("planetary_condition refuses limits out of order", badLimits !== null, badLimits ?? "");

// Secondary progressions share the Live Chart moment.
const apart = (x, y) => Math.abs(((x - y + 540) % 360) - 180);
const progressedAtBirth = atBirth.progressions;
check(
  "progressions at the birth moment are the natal chart",
  progressedAtBirth.positions.every(
    (p, i) => apart(p.longitude, computed.chart.positions[i].longitude) < 1e-6,
  ) &&
    apart(progressedAtBirth.angles.ascendant.longitude, computed.chart.angles.ascendant.longitude) < 1e-5 &&
    apart(progressedAtBirth.angles.midheaven.longitude, computed.chart.angles.midheaven.longitude) < 1e-5,
  `age ${progressedAtBirth.ageYears}`,
);
const progressed = live.progressions;
const natalSun = computed.chart.positions.find((p) => p.body === "sun").longitude;
const progressedSun = progressed.positions.find((p) => p.body === "sun");
check(
  "a day for a year: the progressed Sun has moved about a degree per year of age",
  Math.abs(progressed.ageYears - 53.6) < 0.2 &&
    Math.abs(apart(progressedSun.longitude, natalSun) - progressed.ageYears) < 3 &&
    Math.abs((Date.parse(progressed.utc) - Date.parse(computed.chart.utc)) / 86_400_000 - progressed.ageYears) < 1e-6,
  `age ${progressed.ageYears.toFixed(3)}, Sun moved ${apart(progressedSun.longitude, natalSun).toFixed(2)}°`,
);
check(
  "progressed bodies carry the natal whole-sign house; aspects stay within 1°",
  progressed.positions.every((p) => computed.chart.houses[p.house - 1].sign === p.sign) &&
    progressed.toNatal.every((x) => x.orb <= 1) &&
    progressed.toProgressed.every((x) => x.orb <= 1 && x.a !== "ascendant" && x.b !== "midheaven") &&
    progressed.toNatal.every((x) => !(["ascendant", "midheaven"].includes(x.progressed) && ["ascendant", "midheaven"].includes(x.natal))),
  `${progressed.toNatal.length} to natal, ${progressed.toProgressed.length} among themselves`,
);
const byLongitude = await invoke("live_chart", {
  ...liveArgs,
  at,
  progression: { orb: 1, angleMethod: "naibodLongitude" },
});
const naibodArc = (progressed.ageYears * 360) / 365.2422;
check(
  "Naibod in longitude moves the Midheaven evenly; in right ascension it differs slightly",
  Math.abs(
    apart(byLongitude.progressions.angles.midheaven.longitude, computed.chart.angles.midheaven.longitude) - naibodArc,
  ) < 1e-4 &&
    apart(byLongitude.progressions.angles.midheaven.longitude, progressed.angles.midheaven.longitude) > 0.01 &&
    apart(byLongitude.progressions.angles.midheaven.longitude, progressed.angles.midheaven.longitude) < 6,
  `MC ${progressed.angles.midheaven.longitude.toFixed(3)} / ${byLongitude.progressions.angles.midheaven.longitude.toFixed(3)}`,
);
const untimed = await invoke("live_chart", { ...liveArgs, at, birth: { ...birth, time: null } });
check(
  "unknown birth time: no progressed angles, houses or angle aspects",
  untimed.timeAssumed === true &&
    untimed.progressions.angles === null &&
    untimed.progressions.positions.length === 12 &&
    untimed.progressions.positions.every((p) => p.house === null) &&
    untimed.progressions.toNatal.every(
      (x) => !["ascendant", "midheaven"].includes(x.progressed) && !["ascendant", "midheaven"].includes(x.natal),
    ),
);
const beforeBirth = await invoke("live_chart", { ...liveArgs, at: "1940-01-01T00:00:00Z" });
check("no progressions before the birth", beforeBirth.progressions === null && live.timeAssumed === false);

const wideOrb = await invoke("live_chart", { ...liveArgs, at, progression: { orb: 5, angleMethod: "naibodRightAscension" } });
const moonAspect = wideOrb.progressions.toNatal.find((x) => x.progressed === "moon");
const anglePass = wideOrb.progressions.toNatal.find((x) => x.progressed === "midheaven" || x.progressed === "ascendant");
for (const [label, aspect] of [["progressed Moon", moonAspect], ["progressed angle", anglePass]]) {
  if (!aspect) {
    check(`progression_passes: an aspect of the ${label} to test with`, false);
    continue;
  }
  const passes = await invoke("progression_passes", {
    birth,
    progressed: aspect.progressed,
    other: { natal: aspect.natal },
    kind: aspect.kind,
    at,
    zone,
    angleMethod: "naibodRightAscension",
  });
  const there = passes.length
    ? await invoke("live_chart", { ...liveArgs, at: passes[0].utc, progression: { orb: 5, angleMethod: "naibodRightAscension" } })
    : null;
  const exact = there?.progressions.toNatal.find(
    (x) => x.progressed === aspect.progressed && x.natal === aspect.natal && x.kind === aspect.kind,
  );
  check(
    `progression_passes: the ${label} aspect is exact at the moment found`,
    passes.length >= 1 && exact !== undefined && exact.orb < 1e-3,
    `${aspect.progressed} ${aspect.kind} ${aspect.natal}: ${passes.map((m) => m.local).join(", ")}; orb there ${exact?.orb}`,
  );
}

const rings = await invoke("wheel_rings");
check(
  "wheel_rings gives 36 decans in each scheme and 60 bounds",
  rings.chaldeanDecans.length === 36 &&
    rings.modernDecans.length === 36 &&
    rings.modernDecansTraditional.length === 36 &&
    rings.bounds.length === 60 &&
    rings.chaldeanDecans[0].lord === "mars" &&
    rings.bounds[0].lord === "jupiter" &&
    rings.bounds[0].end === 6,
  `first bound: ${rings.bounds[0]?.lord} to ${rings.bounds[0]?.end}°`,
);

socket.close();

console.log(failures.length === 0 ? "\nAll checks passed." : `\n${failures.length} check(s) failed.`);
process.exit(failures.length === 0 ? 0 : 1);
