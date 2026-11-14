import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, mergeOver } from "./settings";

describe("mergeOver", () => {
  it("uses the defaults when nothing is stored", () => {
    expect(mergeOver(DEFAULT_SETTINGS, null)).toEqual(DEFAULT_SETTINGS);
    expect(mergeOver(DEFAULT_SETTINGS, undefined)).toEqual(DEFAULT_SETTINGS);
    expect(mergeOver(DEFAULT_SETTINGS, "garbage")).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps stored values and fills in what is missing", () => {
    const stored = { orbs: { square: 5 }, colors: { aspects: { trine: "#00ff00" } } };
    const merged = mergeOver(DEFAULT_SETTINGS, stored);
    expect(merged.orbs.square).toBe(5);
    expect(merged.orbs.trine).toBe(7);
    expect(merged.colors.aspects.trine).toBe("#00ff00");
    expect(merged.colors.bodies.sun).toBe(DEFAULT_SETTINGS.colors.bodies.sun);
    expect(merged.showInWheel.southNode).toBe(false);
  });

  it("ignores stored values of the wrong type and unknown keys", () => {
    const stored = { orbs: { square: "wide" }, showInWheel: null, obsolete: true };
    const merged = mergeOver(DEFAULT_SETTINGS, stored);
    expect(merged.orbs.square).toBe(7);
    expect(merged.showInWheel).toEqual(DEFAULT_SETTINGS.showInWheel);
    expect("obsolete" in merged).toBe(false);
  });
});

describe("lot settings", () => {
  it("are filled in for settings saved before lots existed", () => {
    const stored = { orbs: { square: 5 }, showInWheel: { sun: false } };
    const merged = mergeOver(DEFAULT_SETTINGS, stored);
    expect(merged.lots).toEqual(DEFAULT_SETTINGS.lots);
    expect(merged.lots.orb).toBe(3);
    expect(merged.lots.showInWheel.nemesis).toBe(true);
  });

  it("keep a single lot switched off", () => {
    const merged = mergeOver(DEFAULT_SETTINGS, { lots: { showInWheel: { eros: false } } });
    expect(merged.lots.showInWheel.eros).toBe(false);
    expect(merged.lots.showInWheel.fortune).toBe(true);
  });
});
