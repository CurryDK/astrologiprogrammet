import { describe, expect, it } from "vitest";
import {
  aspectLineWidth,
  boxReach,
  keepInSign,
  labelSeparation,
  normalize,
  spreadAngles,
  spreadAnglesBy,
} from "./wheelLayout";

/** Smallest distance between two angles on the circle. */
function distance(a: number, b: number): number {
  const d = normalize(a - b);
  return Math.min(d, 360 - d);
}

function minimumGap(angles: number[]): number {
  let smallest = Infinity;
  for (let i = 0; i < angles.length; i++) {
    for (let j = i + 1; j < angles.length; j++) {
      smallest = Math.min(smallest, distance(angles[i], angles[j]));
    }
  }
  return smallest;
}

describe("spreadAngles", () => {
  it("leaves well-separated symbols where they are", () => {
    expect(spreadAngles([10, 100, 250], 8)).toEqual([10, 100, 250]);
  });

  it("pushes two close symbols apart around their midpoint", () => {
    const [a, b] = spreadAngles([100, 102], 8);
    expect(a).toBeCloseTo(97);
    expect(b).toBeCloseTo(105);
  });

  it("keeps zodiac order inside a group", () => {
    const input = [317, 315, 318.5, 317.2, 302, 303.7, 308.9];
    const output = spreadAngles(input, 8);
    const byInput = input.map((_, i) => i).sort((x, y) => input[x] - input[y]);
    for (let k = 1; k < byInput.length; k++) {
      expect(output[byInput[k]]).toBeGreaterThan(output[byInput[k - 1]]);
    }
    expect(minimumGap(output)).toBeGreaterThanOrEqual(8 - 1e-6);
  });

  it("handles a group that straddles 0° Aries", () => {
    const output = spreadAngles([358, 359, 1, 2], 8);
    expect(minimumGap(output)).toBeGreaterThanOrEqual(8 - 1e-6);
    // The group stays centred on its true middle (0°).
    const offsets = output.map((angle) => (angle > 180 ? angle - 360 : angle));
    expect(offsets.reduce((sum, x) => sum + x, 0) / 4).toBeCloseTo(0);
    expect(offsets).toEqual([...offsets].sort((x, y) => x - y));
  });

  it("merges neighbouring groups that would collide after spreading", () => {
    // Two pairs 9° apart: each pair spread alone would overlap the other.
    const output = spreadAngles([100, 101, 110, 111], 8);
    expect(minimumGap(output)).toBeGreaterThanOrEqual(8 - 1e-6);
  });

  it("handles identical positions", () => {
    const output = spreadAngles([50, 50, 50], 8);
    expect(minimumGap(output)).toBeGreaterThanOrEqual(8 - 1e-6);
    expect([...output].sort((x, y) => x - y)[1]).toBeCloseTo(50);
  });

  it("handles empty and single input", () => {
    expect(spreadAngles([], 8)).toEqual([]);
    expect(spreadAngles([123], 8)).toEqual([123]);
  });
});

describe("aspectLineWidth", () => {
  it("runs linearly from 4.5 px at exact to 0.8 px at the maximum orb", () => {
    expect(aspectLineWidth(0, 7)).toBeCloseTo(4.5);
    expect(aspectLineWidth(7, 7)).toBeCloseTo(0.8);
    expect(aspectLineWidth(3.5, 7)).toBeCloseTo(2.65);
    expect(aspectLineWidth(1.5, 3)).toBeCloseTo(2.65);
  });

  it("depends on the absolute orb and stays within its range", () => {
    expect(aspectLineWidth(-2, 7)).toBeCloseTo(aspectLineWidth(2, 7));
    expect(aspectLineWidth(9, 7)).toBeCloseTo(0.8);
    expect(aspectLineWidth(0, 0)).toBeCloseTo(0.8);
  });
});

describe("spreadAnglesBy", () => {
  const constant = (degrees: number) => () => degrees;
  const distance = (a: number, b: number) => Math.min(normalize(a - b), normalize(b - a));

  it("leaves symbols alone when they have room", () => {
    expect(spreadAnglesBy([10, 100, 250], constant(8))).toEqual([10, 100, 250]);
  });

  it("matches spreadAngles when every gap is the same", () => {
    const input = [100, 101, 110, 111, 300, 358, 1];
    const expected = spreadAngles(input, 8);
    spreadAnglesBy(input, constant(8)).forEach((angle, index) => {
      expect(angle).toBeCloseTo(expected[index]);
    });
  });

  it("gives each pair the room it asks for and keeps the order", () => {
    // The middle symbol is wide: it needs 12° to either neighbour, the others 6°.
    const gap = (_a: number, _b: number, i: number, j: number) => (i === 1 || j === 1 ? 12 : 6);
    const [a, b, c, d] = spreadAnglesBy([50, 51, 52, 53], gap);
    expect(distance(a, b)).toBeCloseTo(12);
    expect(distance(b, c)).toBeCloseTo(12);
    expect(distance(c, d)).toBeCloseTo(6);
    expect(normalize(b - a)).toBeLessThan(180);
    expect(normalize(d - c)).toBeLessThan(180);
  });

  it("handles a group across 0° Aries", () => {
    const output = spreadAnglesBy([358, 359, 1, 2], constant(8));
    expect(distance(output[0], output[1])).toBeCloseTo(8);
    expect(distance(output[1], output[2])).toBeCloseTo(8);
    expect(distance(output[2], output[3])).toBeCloseTo(8);
  });

  it("shrinks the gaps when the wheel is full", () => {
    const input = Array.from({ length: 10 }, (_, k) => k);
    const output = spreadAnglesBy(input, constant(60));
    for (let k = 0; k + 1 < output.length; k++) {
      expect(distance(output[k], output[k + 1])).toBeCloseTo(36);
    }
  });
});

describe("label geometry", () => {
  it("an upright box reaches half its height upwards and half its width sideways", () => {
    expect(boxReach(90, 26, 60)).toBeCloseTo(30);
    expect(boxReach(0, 26, 60)).toBeCloseTo(13);
    expect(boxReach(180, 26, 60)).toBeCloseTo(13);
  });

  it("labels need their width at the top and their height at the sides", () => {
    const radius = 180 / Math.PI; // one degree is one pixel
    expect(labelSeparation(90, 26, 60, radius)).toBeCloseTo(26);
    expect(labelSeparation(270, 26, 60, radius)).toBeCloseTo(26);
    expect(labelSeparation(0, 26, 60, radius)).toBeCloseTo(60);
    expect(labelSeparation(45, 26, 60, radius)).toBeCloseTo(26 * Math.SQRT2);
  });
});

describe("keepInSign", () => {
  it("leaves a label alone in the middle of its sign", () => {
    expect(keepInSign(285, 6, 6)).toBe(285);
  });
  it("moves a label in from the start and the end of its sign", () => {
    expect(keepInSign(270.58, 6, 4)).toBe(276);
    expect(keepInSign(299.5, 6, 4)).toBe(296);
  });
  it("never leaves the sign, also at 0° Aries", () => {
    expect(keepInSign(0, 5, 5)).toBe(5);
    expect(keepInSign(359.9, 5, 5)).toBe(355);
  });
  it("uses the middle when the sign is too small for the label", () => {
    expect(keepInSign(31, 20, 20)).toBe(45);
  });
});

describe("spreadAnglesBy with preferred angles", () => {
  it("keeps the zodiac order when several symbols prefer the same angle", () => {
    const longitudes = [308.9, 302, 303.7, 150];
    const preferred = [309.3, 309.3, 309.3, 150];
    const shown = spreadAnglesBy(longitudes, () => 5, preferred);
    expect(shown[3]).toBeCloseTo(150);
    // Mars (302) before Saturn (303.7) before the Moon (308.9), 5° apart.
    expect(shown[2] - shown[1]).toBeCloseTo(5);
    expect(shown[0] - shown[2]).toBeCloseTo(5);
    expect(shown[2]).toBeCloseTo(309.3);
  });
  it("lets a lone symbol stand at its preferred angle", () => {
    expect(spreadAnglesBy([270.5, 90], () => 5, [276, 90])[0]).toBeCloseTo(276);
  });
});
