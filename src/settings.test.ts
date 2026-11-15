import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, mergeOver, settingsFromStored } from "./settings";

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

describe("profection settings", () => {
  it("default to the birth clock time, 28 February and clock times shown", () => {
    expect(settingsFromStored({ orbs: { square: 5 } }).profections).toEqual({
      yearStart: "birthClockTime",
      leapDay: "february28",
      showTimes: true,
    });
  });

  it("keep a stored choice and drop one this version does not know", () => {
    const kept = settingsFromStored({ profections: { yearStart: "solarReturn", leapDay: "march1" } });
    expect(kept.profections.yearStart).toBe("solarReturn");
    expect(kept.profections.leapDay).toBe("march1");
    const unknown = settingsFromStored({ profections: { yearStart: "sunrise", leapDay: "never" } });
    expect(unknown.profections.yearStart).toBe("birthClockTime");
    expect(unknown.profections.leapDay).toBe("february28");
  });
});

describe("settingsFromStored", () => {
  it("moves aspect colours still at their old default to the new default", () => {
    const stored = {
      colors: { aspects: { sextile: "#f06aa8", square: "#D32F2F", trine: "#123456" } },
    };
    const settings = settingsFromStored(stored);
    expect(settings.colors.aspects.sextile).toBe("#ff1493");
    expect(settings.colors.aspects.square).toBe("#e60000");
    // A colour the user picked is kept.
    expect(settings.colors.aspects.trine).toBe("#123456");
    expect(settings.colors.aspects.opposition).toBe("#ff8c00");
  });

  it("uses the decided default colours when nothing is stored", () => {
    expect(settingsFromStored(null).colors.aspects).toEqual({
      conjunction: "#444444",
      sextile: "#ff1493",
      square: "#e60000",
      trine: "#00a000",
      opposition: "#ff8c00",
    });
  });
});

describe("lot settings", () => {
  it("are filled in for settings saved before lots existed", () => {
    const stored = { orbs: { square: 5 }, showInWheel: { sun: false } };
    const merged = mergeOver(DEFAULT_SETTINGS, stored);
    expect(merged.lots).toEqual(DEFAULT_SETTINGS.lots);
    expect(merged.lots.orb).toBe(3);
    // Decided 15 November 2026: lots are hidden in the wheel until switched on.
    expect(merged.lots.showInWheel.nemesis).toBe(false);
  });

  it("keep a single lot switched on", () => {
    const merged = mergeOver(DEFAULT_SETTINGS, { lots: { showInWheel: { eros: true } } });
    expect(merged.lots.showInWheel.eros).toBe(true);
    expect(merged.lots.showInWheel.fortune).toBe(false);
  });

  it("wheel settings are filled in and an unknown ruler choice falls back", () => {
    const settings = settingsFromStored({ wheel: { rings: { bounds: false }, modernDecanRulers: "other" } });
    expect(settings.wheel.rings).toEqual({ chaldeanDecans: true, modernDecans: false, bounds: false });
    expect(settings.wheel.modernDecanRulers).toBe("modern");
    expect(settings.colors.elements).toEqual(DEFAULT_SETTINGS.colors.elements);
  });
});
