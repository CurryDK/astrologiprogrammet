import { describe, expect, it } from "vitest";
import { aspectLineWidth, normalize, spreadAngles } from "./wheelLayout";

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
  it("is thicker for tighter orbs and never vanishes", () => {
    expect(aspectLineWidth(0)).toBeGreaterThan(aspectLineWidth(3));
    expect(aspectLineWidth(3)).toBeGreaterThan(aspectLineWidth(7));
    expect(aspectLineWidth(15)).toBeGreaterThan(0);
  });
});
