// Every call into the Rust backend goes through here.

import { invoke } from "@tauri-apps/api/core";
import type {
  BirthInput,
  ChartRecord,
  ComputedChart,
  ConditionOptions,
  ConditionReport,
  CourseOptions,
  CourseResult,
  SearchOptions,
  SearchResult,
  SynodicReply,
  CastInput,
  ReturnChoice,
  SolarReturn,
  Sect,
  Folder,
  ImportSummary,
  LifeEvent,
  LiveChart,
  AngleMethod,
  AspectKind,
  Body,
  Moment,
  PassOther,
  PointId,
  ProgressionOther,
  SkyAt,
  SolarFireFile,
  TimeStep,
  LotOptions,
  Orbs,
  Place,
  ProfectionOptions,
  ProfectionReport,
  ResolvedTime,
  WheelRings,
} from "./astro";

const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (inTauri) return invoke<T>(command, args);
  // Outside the app shell (plain browser during development) a small
  // stand-in backend serves fixed data so the screens can be worked on.
  if (import.meta.env.DEV) {
    const { mockInvoke } = await import("./dev/mockBackend");
    return mockInvoke(command, args ?? {}) as Promise<T>;
  }
  throw new Error("Programmet kører ikke i sin egen ramme.");
}

export type AppInfo = { version: string; coreVersion: string };

export const api = {
  appInfo: () => call<AppInfo>("app_info"),

  skyNow: (latitude: number, longitude: number, orbs: Orbs) =>
    call<ComputedChart>("sky_now", { latitude, longitude, orbs }),
  birthResolve: (birth: BirthInput) => call<ResolvedTime>("birth_resolve", { birth }),
  chartCompute: (birth: BirthInput, orbs: Orbs, lots: LotOptions) =>
    call<ComputedChart>("chart_compute", { birth, orbs, lots }),
  /** The profection year for an age; without an age, the year that holds `at` (now when absent). */
  profectionYear: (birth: BirthInput, options: ProfectionOptions, age: number | null, at?: string) =>
    call<ProfectionReport>("profection_year", { birth, options, age, at: at ?? null }),

  /** The sky at a moment (now when null), optionally moved one navigation step. */
  skyAt: (args: {
    at: string | null;
    step: TimeStep | null;
    zone: string;
    latitude: number;
    longitude: number;
    orbs: Orbs;
  }) => call<SkyAt>("sky_at", args),
  /** A local date and clock time (12:00 when null) in a zone, as UTC. */
  localResolve: (date: string, time: string | null, zone: string) =>
    call<ResolvedTime>("local_resolve", { date, time, zone }),
  /** Transits to a natal chart at a moment (now when null), optionally moved one step. */
  liveChart: (args: {
    birth: BirthInput;
    at: string | null;
    step: TimeStep | null;
    zone: string;
    orb: number;
    profections: ProfectionOptions;
    /** Orb of progression aspects and how the progressed angles are moved. */
    progression: { orb: number; angleMethod: AngleMethod };
  }) => call<LiveChart>("live_chart", args),
  /** The exact moments of a transit aspect around `at`; several with retrograde passes. */
  transitPasses: (args: {
    birth: BirthInput;
    transit: Body;
    other: PassOther;
    kind: AspectKind;
    at: string;
    zone: string;
  }) => call<Moment[]>("transit_passes", args),

  /** The moments of life a progression aspect is exact around `at`. */
  progressionPasses: (args: {
    birth: BirthInput;
    progressed: PointId;
    other: ProgressionOther;
    kind: AspectKind;
    at: string;
    zone: string;
    angleMethod: AngleMethod;
  }) => call<Moment[]>("progression_passes", args),

  /** Planetary Condition of a natal chart; `sectOverride` is the manual day/night choice. */
  planetaryCondition: (birth: BirthInput, sectOverride: Sect | null, options: ConditionOptions) =>
    call<ConditionReport>("planetary_condition", { birth, sectOverride, options }),

  /** Planetary Condition of a chart cast for a moment and place (a Solar Return). */
  planetaryConditionAt: (cast: CastInput, sectOverride: Sect | null, options: ConditionOptions) =>
    call<ConditionReport>("planetary_condition_at", { cast, sectOverride, options }),

  /** A Solar Return of a saved chart: the one for `age`, or the one in force now when null. */
  solarReturn: (args: {
    chartId: number;
    age: number | null;
    orbs: Orbs;
    lotOrb: number;
    lotExactOrb: number;
  }) => call<SolarReturn>("solar_return", args),
  /** Stores the place and manual sect chosen for one Solar Return of a chart. */
  solarReturnSet: (chartId: number, age: number, choice: ReturnChoice) =>
    call<void>("solar_return_set", { chartId, age, choice }),

  /** Exact events of a period for a natal chart, with clock readings in `zone`. */
  eventSearch: (birth: BirthInput, options: SearchOptions, zone: string) =>
    call<SearchResult>("event_search", { birth, options, zone }),
  /** The aspects within orb in a period, each from entering the orb over exact to leaving it. */
  aspectCourses: (birth: BirthInput, options: CourseOptions, zone: string) =>
    call<CourseResult>("aspect_courses", { birth, options, zone }),
  /** Each planet's latest and next conjunction with and opposition to the Sun (now when null). */
  synodicCycles: (at: string | null, zone: string) => call<SynodicReply>("synodic_cycles", { at, zone }),

  /** The decan and bounds rings of the wheel; the same for every chart. */
  wheelRings: () => call<WheelRings>("wheel_rings"),

  eventsList: (chartId: number) => call<LifeEvent[]>("events_list", { chartId }),
  eventSave: (event: LifeEvent) => call<LifeEvent>("event_save", { event }),
  eventDelete: (id: number) => call<void>("event_delete", { id }),

  placesSearch: (query: string) => call<Place[]>("places_search", { query }),

  chartsList: () => call<ChartRecord[]>("charts_list"),
  chartSave: (chart: ChartRecord) => call<ChartRecord>("chart_save", { chart }),
  chartDelete: (id: number) => call<void>("chart_delete", { id }),

  foldersList: () => call<Folder[]>("folders_list"),
  folderCreate: (name: string) => call<Folder>("folder_create", { name }),
  folderRename: (id: number, name: string) => call<void>("folder_rename", { id, name }),
  folderDelete: (id: number) => call<void>("folder_delete", { id }),

  /** What a Solar Fire chart file holds, as it would be imported. */
  solarFireRead: (bytes: number[]) => call<SolarFireFile>("solar_fire_read", { bytes }),
  /** Saves the chosen charts of a Solar Fire file, with their life events, in a folder. */
  solarFireImport: (bytes: number[], folder: string, selected: number[]) =>
    call<ImportSummary>("solar_fire_import", { bytes, folder, selected }),

  settingGet: (key: string) => call<string | null>("setting_get", { key }),
  settingSet: (key: string, value: string) => call<void>("setting_set", { key, value }),
};
