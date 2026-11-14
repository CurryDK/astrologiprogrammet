// Development only: stands in for the Rust backend when the interface is
// opened in a plain browser. Calculations are NOT real here — every chart
// is the same fixture. It is never included in the built app.

import type { ChartRecord, Folder, Place } from "../astro";
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

export async function mockInvoke(command: string, args: Record<string, any>): Promise<unknown> {
  switch (command) {
    case "app_info":
      return { version: "dev", coreVersion: "dev" };
    case "sky_now":
      return { ...fixture, time: null };
    case "chart_compute":
      return fixture;
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
