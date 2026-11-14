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
} from "../astro";
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

const { devLotsNight, ...computed } = fixture;

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
    case "setting_get":
      return settings.get(String(args.key)) ?? null;
    case "setting_set":
      settings.set(String(args.key), String(args.value));
      return null;
    default:
      throw new Error(`mock backend: unknown command ${command}`);
  }
}
