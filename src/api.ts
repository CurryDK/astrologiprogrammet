// Every call into the Rust backend goes through here.

import { invoke } from "@tauri-apps/api/core";
import type {
  BirthInput,
  ChartRecord,
  ComputedChart,
  Folder,
  LotOptions,
  Orbs,
  Place,
  ProfectionOptions,
  ProfectionReport,
  ResolvedTime,
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
  /** The profection year for an age; without an age, the year that holds now. */
  profectionYear: (birth: BirthInput, options: ProfectionOptions, age: number | null) =>
    call<ProfectionReport>("profection_year", { birth, options, age }),

  placesSearch: (query: string) => call<Place[]>("places_search", { query }),

  chartsList: () => call<ChartRecord[]>("charts_list"),
  chartSave: (chart: ChartRecord) => call<ChartRecord>("chart_save", { chart }),
  chartDelete: (id: number) => call<void>("chart_delete", { id }),

  foldersList: () => call<Folder[]>("folders_list"),
  folderCreate: (name: string) => call<Folder>("folder_create", { name }),
  folderRename: (id: number, name: string) => call<void>("folder_rename", { id, name }),
  folderDelete: (id: number) => call<void>("folder_delete", { id }),

  settingGet: (key: string) => call<string | null>("setting_get", { key }),
  settingSet: (key: string, value: string) => call<void>("setting_set", { key, value }),
};
