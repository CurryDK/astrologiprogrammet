import { describe, expect, it } from "vitest";
import { lotAspectsForView } from "./aspectFilter";
import type { LotAspect } from "./astro";
import { DEFAULT_SETTINGS, type Settings } from "./settings";

const aspect = (other: LotAspect["other"]): LotAspect => ({
  lot: "fortune",
  other,
  kind: "trine",
  orb: 1,
  exact: false,
  outOfSign: false,
});
const all = [aspect("sun"), aspect("southNode"), aspect("ascendant"), aspect("spirit")];
const others = (settings: Settings) => lotAspectsForView(all, settings).map((a) => a.other);

describe("lotAspectsForView", () => {
  it("shows aspects to planets only by default, leaving out bodies switched off for aspects", () => {
    expect(others(DEFAULT_SETTINGS)).toEqual(["sun"]);
  });

  it("adds angles and other lots when switched on", () => {
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      lots: { ...DEFAULT_SETTINGS.lots, aspectsTo: { planets: false, angles: true, lots: true } },
    };
    expect(others(settings)).toEqual(["ascendant", "spirit"]);
  });
});
