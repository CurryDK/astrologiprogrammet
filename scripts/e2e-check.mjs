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

const computed = await invoke("chart_compute", { birth, orbs });
const sun = computed.chart.positions.find((p) => p.body === "sun");
check("chart_compute: Sun in Gemini on 1 June", sun.sign === "gemini", `${sun.degree}°${sun.minute}′`);
check("chart_compute returns aspects", computed.aspects.length > 0, `${computed.aspects.length} aspects`);

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
  },
});
check("chart_save assigns an id", Number.isInteger(saved.id));
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
