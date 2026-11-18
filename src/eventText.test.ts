import { describe, expect, it } from "vitest";
import type { Moment, SearchEvent, ZodiacPoint } from "./astro";
import { defaultPointChoice, eventText, formatDays, formatDaysFrom, layerPointName } from "./eventText";
import { DEFAULT_SETTINGS } from "./settings";

const at: Moment = { utc: "2026-03-20T14:46:00Z", local: "2026-03-20T15:46:00", offsetSeconds: 3600 };
const position: ZodiacPoint = { longitude: 0, sign: "aries", degree: 0, minute: 0 };
const base = { at, utc: at.utc, position, uncertain: false };

describe("eventText", () => {
  it("names both layers of an aspect", () => {
    const event: SearchEvent = {
      ...base,
      type: "aspect",
      a: { layer: "transit", point: "mars" },
      b: { layer: "natal", point: "sun" },
      kind: "square",
    };
    expect(eventText(event)).toBe("Transit Mars kvadrat natal Solen");
  });

  it("says when a point backs into a sign", () => {
    const event: SearchEvent = {
      ...base,
      type: "signChange",
      point: { layer: "progressed", point: "mercury" },
      sign: "pisces",
      retrograde: true,
    };
    expect(eventText(event)).toBe("Progressiv Merkur går ind i Fiskene (retrograd)");
  });

  it("words the progressed events", () => {
    expect(eventText({ ...base, type: "station", point: { layer: "transit", point: "venus" }, turns: "direct" })).toBe(
      "Transit Venus stationerer direkte",
    );
    expect(eventText({ ...base, type: "moonHouse", house: 5, sign: "scorpio" })).toBe(
      "Progressiv Månen går ind i 5. natalhus (Skorpionen)",
    );
    expect(eventText({ ...base, type: "lunation", phase: 4 })).toBe("Progressiv fuldmåne");
    expect(eventText({ ...base, type: "lunation", phase: 3 })).toBe("Progressiv lunationsfase 135°");
    expect(
      eventText({
        ...base,
        type: "boundChange",
        point: { layer: "progressed", point: "sun" },
        lord: "jupiter",
        retrograde: false,
      }),
    ).toBe("Progressiv Solen går ind i Jupiters bound");
  });

  it("shortens the angles", () => {
    expect(layerPointName({ layer: "progressed", point: "ascendant" })).toBe("Progressiv ASC");
    expect(layerPointName({ layer: "natal", point: "midheaven" })).toBe("natal MC");
  });
});

describe("formatDays", () => {
  it("counts whole days and never rounds up", () => {
    expect(formatDays(0.4)).toBe("under 1 dag");
    expect(formatDays(1.9)).toBe("1 dag");
    expect(formatDays(14.99)).toBe("14 dage");
  });

  it("says before or after the reference moment", () => {
    expect(formatDaysFrom(-12.3)).toBe("for 12 dage siden");
    expect(formatDaysFrom(3.7)).toBe("om 3 dage");
  });
});

describe("defaultPointChoice", () => {
  it("starts from what is switched on for aspects elsewhere", () => {
    const choice = defaultPointChoice(DEFAULT_SETTINGS);
    expect(choice.transitBodies).toContain("moon");
    expect(choice.transitBodies).not.toContain("southNode");
    expect(choice.progressedPoints).toContain("ascendant");
    expect(choice.natalPoints).toEqual(expect.arrayContaining(["sun", "ascendant", "midheaven"]));
    expect(choice.kinds).toHaveLength(5);
  });
});
