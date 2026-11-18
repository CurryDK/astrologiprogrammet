// Development only: stands in for the Rust backend when the interface is
// opened in a plain browser. Calculations are NOT real here — every chart
// is the same fixture. It is never included in the built app.

import type {
  BirthInput,
  ChartRecord,
  Folder,
  LotOptions,
  LotReport,
  Moment,
  Place,
  ProfectionOptions,
  ProfectionReport,
  Sign,
  Body,
  Aspect,
  AspectKind,
  BodyPosition,
  LifeEvent,
  LiveChart,
  PointId,
  ProgressedAspect,
  SolarFireChart,
  Progressions,
  TimeStep,
  TransitAspect,
} from "../astro";
import { SIGNS } from "../astro";
import fixture from "./fixture.json";

let nextId = 3;
const folders: Folder[] = [{ id: 1, name: "Familie" }];
const charts: ChartRecord[] = [
  {
    id: 1,
    name: "Testhoroskop 1962",
    folderId: 1,
    birthDate: "1962-02-04",
    birthTime: "14:20",
    placeName: "Copenhagen",
    countryCode: "DK",
    latitude: 55.6759,
    longitude: 12.5655,
    zone: "Europe/Copenhagen",
    offsetSeconds: null,
    featured: true,
    sectOverride: null,
  },
  {
    id: 2,
    name: "Uden tidspunkt",
    folderId: null,
    birthDate: "1950-06-15",
    birthTime: null,
    placeName: "Aarhus",
    countryCode: "DK",
    latitude: 56.1567,
    longitude: 10.2108,
    zone: "Europe/Copenhagen",
    offsetSeconds: null,
    featured: false,
    sectOverride: null,
  },
];
const settings = new Map<string, string>();
/** The place and manual sect chosen per chart and Solar Return year. */
const returnChoices = new Map<string, { place: any; sectOverride: "day" | "night" | null }>();

const places: Place[] = [
  {
    name: "Copenhagen",
    countryCode: "DK",
    region: "Capital Region",
    latitude: 55.6759,
    longitude: 12.5655,
    zone: "Europe/Copenhagen",
    population: 1153615,
  },
  {
    name: "Aarhus",
    countryCode: "DK",
    region: "Central Jutland",
    latitude: 56.1567,
    longitude: 10.2108,
    zone: "Europe/Copenhagen",
    population: 285273,
  },
];

const { devLotsNight, devCondition, devRings, ...computed } = fixture;

/** The fixture's lots for the asked sect, cut down to the asked orb. */
function lotsFor(options: LotOptions): LotReport {
  const source = (options.sectOverride === "night" ? devLotsNight : computed.lots) as LotReport;
  return {
    ...source,
    sect: options.sectOverride ?? "day",
    overridden: options.sectOverride !== null,
    aspects: source.aspects
      .filter((aspect) => aspect.orb <= options.orb)
      .map((aspect) => ({ ...aspect, exact: aspect.orb < options.exactOrb })),
  };
}

/**
 * A rough stand-in for the real profection calculation: the birthplace is
 * taken to be at UTC+1 all year, the solar return rule is treated as the
 * birth clock time, and the houses are the fixture's.
 */
function profectionsFor(
  birth: BirthInput,
  options: ProfectionOptions,
  askedAge: number | null,
): ProfectionReport {
  const offsetSeconds = 3600;
  const [y, m, d] = birth.date.split("-").map(Number);
  const [hour, minute] =
    options.yearStart === "midnight" ? [0, 0] : (birth.time ?? "12:00").split(":").map(Number);
  const yearStart = (age: number) => {
    const leapDayMissing = m === 2 && d === 29 && new Date(Date.UTC(y + age, 1, 29)).getUTCMonth() !== 1;
    const [month, day] = leapDayMissing ? (options.leapDay === "march1" ? [3, 1] : [2, 28]) : [m, d];
    return Date.UTC(y + age, month - 1, day, hour, minute) - offsetSeconds * 1000;
  };
  const moment = (ms: number): Moment => ({
    utc: new Date(ms).toISOString(),
    local: new Date(ms + offsetSeconds * 1000).toISOString().slice(0, 19),
    offsetSeconds,
  });

  const now = Date.now();
  let currentAge: number | null = null;
  if (now >= yearStart(0)) {
    currentAge = 0;
    while (currentAge < 150 && now >= yearStart(currentAge + 1)) currentAge++;
  }
  const age = askedAge ?? currentAge ?? 0;
  const start = yearStart(age);
  const end = yearStart(age + 1);
  const houses = computed.chart.houses as { number: number; sign: Sign; ruler: Body }[];
  const yearHouse = houses[age % 12];
  const months = Array.from({ length: 12 }, (_, i) => {
    const house = houses[(age + i) % 12];
    return {
      number: i + 1,
      start: moment(start + ((end - start) * i) / 12),
      end: moment(start + ((end - start) * (i + 1)) / 12),
      house: house.number,
      sign: house.sign,
      ruler: house.ruler,
    };
  });
  const current = months.find((month) => Date.parse(month.start.utc) <= now && now < Date.parse(month.end.utc));
  return {
    year: {
      age,
      start: moment(start),
      end: moment(end),
      house: yearHouse.number,
      sign: yearHouse.sign,
      timeLord: yearHouse.ruler,
      months,
    },
    currentAge,
    currentMonth: current?.number ?? null,
    timeAssumed: birth.time === null,
  };
}

// --- Transits, Live Chart and life events (stand-ins) -----------------------

const OFFSET_SECONDS = 3600;

const moment = (ms: number): Moment => ({
  utc: new Date(ms).toISOString(),
  local: new Date(ms + OFFSET_SECONDS * 1000).toISOString().slice(0, 19),
  offsetSeconds: OFFSET_SECONDS,
});

/** Rough mean daily motions; the stand-in sky moves evenly and never turns retrograde. */
const MEAN_SPEED: Record<Body, number> = {
  sun: 0.9856,
  moon: 13.1764,
  mercury: 1.3833,
  venus: 1.2,
  mars: 0.524,
  jupiter: 0.0831,
  saturn: 0.0335,
  uranus: 0.0117,
  neptune: 0.006,
  pluto: 0.004,
  northNode: -0.053,
  southNode: -0.053,
};

const mod360 = (x: number) => ((x % 360) + 360) % 360;
const fixturePositions = computed.chart.positions as BodyPosition[];
const fixtureHouses = computed.chart.houses as { number: number; sign: Sign; ruler: Body }[];

function positionsAt(ms: number): BodyPosition[] {
  const days = (ms - Date.parse(computed.chart.utc)) / 86_400_000;
  return fixturePositions.map((p) => {
    const longitude = mod360(p.longitude + MEAN_SPEED[p.body] * days);
    const sign = SIGNS[Math.floor(longitude / 30)];
    const minutes = Math.floor((longitude % 30) * 60);
    return {
      ...p,
      longitude,
      sign,
      degree: Math.floor(minutes / 60),
      minute: minutes % 60,
      speed: MEAN_SPEED[p.body],
      retrograde: MEAN_SPEED[p.body] < 0,
      house: fixtureHouses.find((h) => h.sign === sign)!.number,
    };
  });
}

const ASPECT_ANGLES: [AspectKind, number][] = [
  ["conjunction", 0],
  ["sextile", 60],
  ["square", 90],
  ["trine", 120],
  ["opposition", 180],
];

function aspectOf(a: number, b: number, speedA: number, speedB: number, orb: number) {
  let arc = mod360(b - a);
  if (arc > 180) arc -= 360;
  const separation = Math.abs(arc);
  for (const [kind, angle] of ASPECT_ANGLES) {
    const deviation = separation - angle;
    if (Math.abs(deviation) > orb) continue;
    const separationRate = arc >= 0 ? speedB - speedA : speedA - speedB;
    const signsApart = Math.abs(Math.floor(a / 30) - Math.floor(b / 30));
    return {
      kind,
      orb: Math.abs(deviation),
      applying: (deviation >= 0 ? separationRate : -separationRate) < 0,
      outOfSign: Math.min(signsApart, 12 - signsApart) !== angle / 30,
    };
  }
  return null;
}

function stepped(at: string | null, step: TimeStep | null): number {
  const date = new Date(at ?? Date.now());
  if (step) {
    const { unit, count } = step;
    if (unit === "minute") date.setUTCMinutes(date.getUTCMinutes() + count);
    else if (unit === "hour") date.setUTCHours(date.getUTCHours() + count);
    else if (unit === "day") date.setUTCDate(date.getUTCDate() + count);
    else if (unit === "week") date.setUTCDate(date.getUTCDate() + 7 * count);
    else date.setUTCMonth(date.getUTCMonth() + count);
  }
  return date.getTime();
}

function natalLongitude(point: PointId): number {
  if (point === "ascendant" || point === "midheaven") return computed.chart.angles[point].longitude;
  return fixturePositions.find((p) => p.body === point)!.longitude;
}

function liveChartFor(args: Record<string, any>): LiveChart {
  const ms = stepped(args.at, args.step);
  const positions = positionsAt(ms);
  const natalPoints: PointId[] = [...fixturePositions.map((p) => p.body), "ascendant", "midheaven"];
  const toNatal: TransitAspect[] = [];
  const toTransit: Aspect[] = [];
  positions.forEach((t, i) => {
    for (const natal of natalPoints) {
      const found = aspectOf(t.longitude, natalLongitude(natal), t.speed, 0, args.orb);
      if (found) toNatal.push({ transit: t.body, natal, ...found });
    }
    for (const other of positions.slice(i + 1)) {
      if (t.body.endsWith("Node") && other.body.endsWith("Node")) continue;
      const found = aspectOf(t.longitude, other.longitude, t.speed, other.speed, args.orb);
      if (found) toTransit.push({ a: t.body, b: other.body, ...found });
    }
  });

  const birth = args.birth as BirthInput;
  const options = args.profections as ProfectionOptions;
  const born = profectionsFor(birth, options, 0);
  let age: number | null = null;
  let profection: LiveChart["profection"] = null;
  let profectionMonth: number | null = null;
  if (ms >= Date.parse(born.year.start.utc)) {
    age = Math.max(0, new Date(ms).getUTCFullYear() - Number(birth.date.slice(0, 4)));
    if (ms < Date.parse(profectionsFor(birth, options, age).year.start.utc)) age -= 1;
    profection = profectionsFor(birth, options, age).year;
    profectionMonth =
      profection.months.find((m) => Date.parse(m.start.utc) <= ms && ms < Date.parse(m.end.utc))
        ?.number ?? null;
  }
  return {
    at: moment(ms),
    positions,
    toNatal,
    toTransit,
    age,
    profection,
    profectionMonth,
    progressions: progressionsFor(ms, args.progression.orb, birth.time !== null),
    timeAssumed: birth.time === null,
  };
}

const TROPICAL_YEAR = 365.2422;
const birthMs = Date.parse(computed.chart.utc);

/** Progressed Ascendant and Midheaven of the stand-in: a degree a year, evenly. */
function progressedAngle(point: "ascendant" | "midheaven", ageYears: number): number {
  return mod360(computed.chart.angles[point].longitude + ageYears * (360 / TROPICAL_YEAR));
}

function zodiacPoint(longitude: number) {
  const minutes = Math.floor((longitude % 30) * 60);
  return {
    longitude,
    sign: SIGNS[Math.floor(longitude / 30)],
    degree: Math.floor(minutes / 60),
    minute: minutes % 60,
  };
}

/** Progressions with the evenly moving stand-in sky: a day after the birth for each year. */
function progressionsFor(ms: number, orb: number, timeKnown: boolean): Progressions | null {
  const ageYears = (ms - birthMs) / 86_400_000 / TROPICAL_YEAR;
  if (ageYears < 0 || ageYears > 150) return null;
  const progressedMs = birthMs + ageYears * 86_400_000;
  const positions = positionsAt(progressedMs).map(({ latitude: _latitude, ...p }) => ({
    ...p,
    house: timeKnown ? p.house : null,
  }));
  const houseOf = (sign: Sign) => fixtureHouses.find((h) => h.sign === sign)!.number;
  const angle = (point: "ascendant" | "midheaven") => {
    const at = zodiacPoint(progressedAngle(point, ageYears));
    return { ...at, house: houseOf(at.sign) };
  };
  const angles = timeKnown ? { ascendant: angle("ascendant"), midheaven: angle("midheaven") } : null;

  const natalBodies: PointId[] = fixturePositions.map((p) => p.body);
  const natalPoints: PointId[] = timeKnown ? [...natalBodies, "ascendant", "midheaven"] : natalBodies;
  const toNatal: ProgressedAspect[] = [];
  const toProgressed: Aspect[] = [];
  positions.forEach((p, i) => {
    for (const natal of natalPoints) {
      const found = aspectOf(p.longitude, natalLongitude(natal), p.speed, 0, orb);
      if (found) toNatal.push({ progressed: p.body, natal, ...found });
    }
    for (const other of positions.slice(i + 1)) {
      if (p.body.endsWith("Node") && other.body.endsWith("Node")) continue;
      const found = aspectOf(p.longitude, other.longitude, p.speed, other.speed, orb);
      if (found) toProgressed.push({ a: p.body, b: other.body, ...found });
    }
  });
  if (angles) {
    for (const point of ["ascendant", "midheaven"] as const) {
      for (const natal of natalBodies) {
        const found = aspectOf(angles[point].longitude, natalLongitude(natal), 1, 0, orb);
        if (found) toNatal.push({ progressed: point, natal, ...found });
      }
    }
  }
  return {
    utc: new Date(progressedMs).toISOString(),
    ageYears,
    positions,
    angles,
    toNatal,
    toProgressed,
  };
}

/** Exact moments of a progression aspect with the stand-in sky; Mercury pretends to pass three times. */
function progressionPassesFor(args: Record<string, any>): Moment[] {
  const ms = Date.parse(args.at);
  const ageYears = (ms - birthMs) / 86_400_000 / TROPICAL_YEAR;
  const sky = positionsAt(birthMs + ageYears * 86_400_000);
  const isAngle = args.progressed === "ascendant" || args.progressed === "midheaven";
  const moving = isAngle
    ? { longitude: progressedAngle(args.progressed, ageYears), speed: 360 / TROPICAL_YEAR }
    : sky.find((p) => p.body === args.progressed)!;
  const other = "natal" in args.other ? null : sky.find((p) => p.body === args.other.progressed)!;
  const target = other ? other.longitude : natalLongitude(args.other.natal);
  const angle = ASPECT_ANGLES.find(([kind]) => kind === args.kind)![1];
  let arc = mod360(moving.longitude - target);
  if (arc > 180) arc -= 360;
  let distance = mod360(moving.longitude - target - (arc >= 0 ? angle : -angle));
  if (distance > 180) distance -= 360;
  // Degrees per year of life: a day of the stand-in sky is a year.
  const rate = moving.speed - (other ? other.speed : 0);
  const exactAge = ageYears - distance / rate;
  const years = args.progressed === "mercury" ? [0, 3, 7] : [0];
  return years
    .map((y) => exactAge + y)
    .filter((age) => age >= 0 && age <= 150)
    .map((age) => moment(birthMs + age * TROPICAL_YEAR * 86_400_000));
}

/** Exact moments with the evenly moving stand-in sky; Mercury pretends to pass three times. */
function passesFor(args: Record<string, any>): Moment[] {
  const ms = Date.parse(args.at);
  const now = positionsAt(ms);
  const transit = now.find((p) => p.body === args.transit)!;
  const other = "natal" in args.other ? null : now.find((p) => p.body === args.other.transit)!;
  const target = other ? other.longitude : natalLongitude(args.other.natal);
  const angle = ASPECT_ANGLES.find(([kind]) => kind === args.kind)![1];
  let arc = mod360(transit.longitude - target);
  if (arc > 180) arc -= 360;
  let distance = mod360(transit.longitude - target - (arc >= 0 ? angle : -angle));
  if (distance > 180) distance -= 360;
  const rate = transit.speed - (other ? other.speed : 0);
  const exact = ms - (distance / rate) * 86_400_000;
  const days = args.transit === "mercury" ? [0, 12, 27] : [0];
  return days.map((d) => moment(exact + d * 86_400_000));
}

let nextEventId = 3;
const events: LifeEvent[] = [
  { id: 1, chartId: 1, title: "Bryllup", year: 1988, month: 6, day: 18, time: "14:00", zone: "Europe/Copenhagen", note: "" },
  { id: 2, chartId: 1, title: "Flyttede til Aarhus", year: 1995, month: null, day: null, time: null, zone: "Europe/Copenhagen", note: "" },
];

/** A made-up Solar Fire file: whatever file is chosen, these charts are in it. */
function mockSolarFire(): SolarFireChart[] {
  const base = {
    placeName: "Copenhagen",
    countryCode: "DK",
    latitude: 55.6667,
    longitude: 12.5833,
    zone: "Europe/Copenhagen",
    offsetSeconds: null,
    fileOffsetSeconds: 3600,
    rating: "AA",
    events: [],
    eventsSkipped: 0,
    problem: null,
  };
  const known = (name: string, birthDate: string, birthTime: string | null) =>
    charts.some((c) => c.name === name && c.birthDate === birthDate && c.birthTime === birthTime);
  const list: Omit<SolarFireChart, "inArchive">[] = [
    {
      ...base,
      name: "Importeret Ida",
      birthDate: "1967-08-20",
      birthTime: "13:15",
      events: [
        { title: "Flyttede hjemmefra", year: 1986, month: 9, day: 1, time: "10:30", zone: "Europe/Copenhagen", note: "" },
        { title: "Gift", year: 2000, month: 5, day: 30, time: "14:00", zone: "Europe/Copenhagen", note: "cirka" },
      ],
    },
    { ...base, name: "Importeret uden tid", birthDate: "1948-04-01", birthTime: null, rating: "X" },
    { ...base, name: "Forkert sommertid", birthDate: "2026-04-23", birthTime: "13:49", offsetSeconds: 3600, rating: "" },
    { ...base, name: "Testhoroskop 1962", birthDate: "1962-02-04", birthTime: "14:20" },
    { ...base, name: "For gammel", birthDate: "1500-01-01", birthTime: "12:00", problem: "årstallet 1500 er uden for programmets område" },
  ];
  return list.map((chart) => ({ ...chart, inArchive: known(chart.name, chart.birthDate, chart.birthTime) }));
}

export async function mockInvoke(command: string, args: Record<string, any>): Promise<unknown> {
  switch (command) {
    case "app_info":
      return { version: "dev", coreVersion: "dev" };
    case "sky_now":
      return { ...computed, time: null, lots: null };
    case "chart_compute":
      return { ...computed, lots: lotsFor(args.lots as LotOptions) };
    case "profection_year":
      return profectionsFor(
        args.birth as BirthInput,
        args.options as ProfectionOptions,
        (args.age as number | null) ?? null,
      );
    case "sky_at": {
      const ms = stepped(args.at, args.step);
      return {
        at: moment(ms),
        computed: {
          ...computed,
          chart: { ...computed.chart, utc: new Date(ms).toISOString(), positions: positionsAt(ms) },
          time: null,
          lots: null,
        },
      };
    }
    case "live_chart":
      return liveChartFor(args);
    case "progression_passes":
      return progressionPassesFor(args);
    case "transit_passes":
      return passesFor(args);
    case "local_resolve": {
      const ms = Date.parse(`${args.date}T${args.time ?? "12:00"}:00Z`) - OFFSET_SECONDS * 1000;
      if (Number.isNaN(ms)) throw new Error("ugyldig dato");
      return {
        utc: new Date(ms).toISOString(),
        offsetSeconds: OFFSET_SECONDS,
        timeAssumed: args.time == null,
        ambiguous: false,
      };
    }
    case "planetary_condition":
      // The fixture's own report; the limits and a manual sect are not applied.
      return {
        ...devCondition,
        sect: args.sectOverride ?? devCondition.sect,
        overridden: args.sectOverride != null,
      };
    case "planetary_condition_at":
      return {
        ...devCondition,
        sect: args.sectOverride ?? devCondition.sect,
        overridden: args.sectOverride != null,
      };
    case "solar_return": {
      // Not a real return: the fixture's chart, a tropical year per age after the birth.
      const record = charts.find((c) => c.id === args.chartId);
      if (!record) throw new Error("horoskopet findes ikke");
      const yearMs = 365.2422 * 86_400_000;
      const born = Date.parse(computed.chart.utc);
      const activeAge = Math.max(0, Math.floor((Date.now() - born) / yearMs));
      const age = (args.age as number | null) ?? activeAge;
      const choice = returnChoices.get(`${args.chartId}:${age}`) ?? { place: null, sectOverride: null };
      const timeAssumed = record.birthTime === null;
      const ms = born + age * yearMs;
      return {
        age,
        activeAge,
        moment: moment(ms),
        place: choice.place
          ? { ...choice.place, offsetSeconds: null, changed: true }
          : {
              name: record.placeName,
              countryCode: record.countryCode,
              latitude: record.latitude,
              longitude: record.longitude,
              zone: record.zone,
              offsetSeconds: record.offsetSeconds,
              changed: false,
            },
        sectOverride: choice.sectOverride,
        computed: {
          ...computed,
          chart: { ...computed.chart, utc: new Date(ms).toISOString() },
          time: null,
          lots: timeAssumed
            ? null
            : lotsFor({ sectOverride: choice.sectOverride, orb: args.lotOrb, exactOrb: args.lotExactOrb }),
        },
        timeAssumed,
        timeLord: timeAssumed ? null : fixtureHouses[age % 12].ruler,
      };
    }
    case "solar_return_set":
      returnChoices.set(`${args.chartId}:${args.age}`, args.choice);
      return null;
    case "event_search": {
      // Not a real search: a handful of made-up events spread over the period.
      const from = Date.parse(args.options.start);
      const span = Date.parse(args.options.end) - from;
      const point = (layer: string, body: string) => ({ layer, point: body });
      const kinds = [
        { type: "aspect", a: point("transit", "mars"), b: point("natal", "sun"), kind: "square" },
        { type: "signChange", point: point("transit", "venus"), sign: "aries", retrograde: false },
        { type: "station", point: point("transit", "mercury"), turns: "retrograde" },
        { type: "aspect", a: point("progressed", "moon"), b: point("natal", "venus"), kind: "trine" },
        { type: "moonHouse", house: 5, sign: "scorpio" },
        { type: "lunation", phase: 2 },
        { type: "boundChange", point: point("progressed", "venus"), lord: "jupiter", retrograde: false },
        { type: "decanChange", point: point("progressed", "sun"), lord: "mars", retrograde: false },
      ];
      return {
        truncated: false,
        events: kinds.map((kind, index) => {
          const ms = from + (span * (index + 1)) / (kinds.length + 1);
          return {
            ...kind,
            at: moment(ms),
            utc: new Date(ms).toISOString(),
            position: zodiacPoint(40 * index + 12.5),
            uncertain: false,
          };
        }),
      };
    }
    case "aspect_courses": {
      // Not real courses: two made-up ones around the reference moment.
      const at = Date.parse(args.options.at);
      const day = 86_400_000;
      const point = (layer: string, body: string) => ({ layer, point: body });
      return {
        truncated: false,
        at: moment(at),
        start: moment(Date.parse(args.options.start)),
        end: moment(Date.parse(args.options.end)),
        courses: [
          {
            a: point("transit", "sun"),
            b: point("natal", "jupiter"),
            kind: "trine",
            positionA: zodiacPoint(215.4),
            positionB: zodiacPoint(338.5),
            orb: 3.1,
            applying: true,
            periods: [{ enter: moment(at - 4 * day), leave: moment(at + 10 * day) }],
            exact: [moment(at + 3 * day)],
            daysInOrb: 14,
            uncertain: false,
          },
          {
            a: point("transit", "mercury"),
            b: point("natal", "venus"),
            kind: "conjunction",
            positionA: zodiacPoint(318.2),
            positionB: zodiacPoint(317.2),
            orb: 1.0,
            applying: false,
            periods: [
              { enter: moment(at - 20 * day), leave: moment(at + 2 * day) },
              { enter: moment(at + 15 * day), leave: moment(at + 24 * day) },
            ],
            exact: [moment(at - 12 * day), moment(at - 1 * day), moment(at + 19 * day)],
            daysInOrb: 31,
            uncertain: false,
          },
        ],
      };
    }
    case "synodic_cycles": {
      // Not real cycles: every planet gets the same made-up distances in days.
      const at = args.at ? Date.parse(args.at) : Date.now();
      const day = 86_400_000;
      const event = (kind: string, days: number, longitude: number) => ({
        kind,
        at: moment(at + days * day),
        position: zodiacPoint(longitude),
        days,
      });
      const bodies = ["mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"];
      return {
        at: moment(at),
        cycles: bodies.map((body, index) => {
          const inner = index < 2;
          return {
            body,
            position: zodiacPoint(33 * index + 5),
            retrograde: index % 3 === 0,
            lastConjunction: event(inner ? "inferiorConjunction" : "conjunction", -40 - 20 * index, 30 * index),
            nextConjunction: event(inner ? "superiorConjunction" : "conjunction", 60 + 30 * index, 30 * index + 90),
            lastOpposition: inner ? null : event("opposition", -200, 30 * index + 180),
            nextOpposition: inner ? null : event("opposition", 180, 30 * index + 200),
          };
        }),
      };
    }
    case "wheel_rings":
      return devRings;
    case "events_list":
      return events
        .filter((e) => e.chartId === args.chartId)
        .sort(
          (a, b) =>
            a.year - b.year || (a.month ?? 0) - (b.month ?? 0) || (a.day ?? 0) - (b.day ?? 0),
        );
    case "event_save": {
      const event = { ...(args.event as LifeEvent) };
      if (event.id === null) {
        event.id = nextEventId++;
        events.push(event);
      } else {
        events[events.findIndex((e) => e.id === event.id)] = event;
      }
      return event;
    }
    case "event_delete":
      events.splice(events.findIndex((e) => e.id === args.id), 1);
      return null;
    case "birth_resolve":
      return fixture.time;
    case "places_search":
      return places.filter((p) => p.name.toLowerCase().includes(String(args.query).toLowerCase()));
    case "charts_list":
      return [...charts].sort((a, b) => a.name.localeCompare(b.name, "da"));
    case "chart_save": {
      const chart = { ...(args.chart as ChartRecord) };
      if (chart.id === null) {
        chart.id = nextId++;
        charts.push(chart);
      } else {
        charts[charts.findIndex((c) => c.id === chart.id)] = chart;
      }
      return chart;
    }
    case "chart_delete":
      charts.splice(charts.findIndex((c) => c.id === args.id), 1);
      return null;
    case "folders_list":
      return [...folders];
    case "folder_create": {
      const folder = { id: nextId++, name: String(args.name) };
      folders.push(folder);
      return folder;
    }
    case "folder_rename":
      folders.find((f) => f.id === args.id)!.name = String(args.name);
      return null;
    case "folder_delete":
      folders.splice(folders.findIndex((f) => f.id === args.id), 1);
      for (const chart of charts) if (chart.folderId === args.id) chart.folderId = null;
      return null;
    case "solar_fire_read":
      return { title: "New Chart File", charts: mockSolarFire() };
    case "solar_fire_import": {
      const name = String(args.folder).trim();
      let folder = folders.find((f) => f.name.toLowerCase() === name.toLowerCase());
      if (!folder && name) {
        folder = { id: nextId++, name };
        folders.push(folder);
      }
      const chosen = (args.selected as number[]).map((index) => mockSolarFire()[index]);
      for (const chart of chosen) {
        const id = nextId++;
        charts.push({
          id,
          name: chart.name,
          folderId: folder?.id ?? null,
          birthDate: chart.birthDate,
          birthTime: chart.birthTime,
          placeName: chart.placeName,
          countryCode: chart.countryCode,
          latitude: chart.latitude,
          longitude: chart.longitude,
          zone: chart.zone,
          offsetSeconds: chart.offsetSeconds,
          featured: false,
          sectOverride: null,
        });
        for (const event of chart.events) {
          events.push({ id: nextEventId++, chartId: id, ...event });
        }
      }
      return {
        folderId: folder?.id ?? null,
        charts: chosen.length,
        events: chosen.reduce((sum, chart) => sum + chart.events.length, 0),
      };
    }
    case "setting_get":
      return settings.get(String(args.key)) ?? null;
    case "setting_set":
      settings.set(String(args.key), String(args.value));
      return null;
    default:
      throw new Error(`mock backend: unknown command ${command}`);
  }
}
