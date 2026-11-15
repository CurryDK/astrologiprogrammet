// Geometry helpers for the chart wheel.

/** Reduce an angle to [0, 360). */
export function normalize(degrees: number): number {
  const reduced = ((degrees % 360) + 360) % 360;
  return reduced >= 360 ? 0 : reduced;
}

/**
 * Display angles for symbols that would otherwise overlap (specification §4).
 *
 * Symbols closer than `minSeparation` degrees are pushed apart symmetrically
 * around the middle of their group, keeping their zodiac order. The true
 * positions are not changed; the wheel draws a line from each symbol back to
 * its exact degree.
 *
 * Returns one display angle per input longitude, in the same order.
 */
export function spreadAngles(longitudes: number[], minSeparation: number): number[] {
  const count = longitudes.length;
  if (count === 0) return [];
  const separation = Math.min(minSeparation, 360 / count);

  const order = longitudes
    .map((longitude, index) => ({ index, longitude: normalize(longitude) }))
    .sort((a, b) => a.longitude - b.longitude);

  // Start the sequence after the widest empty stretch, so that a group
  // straddling 0° Aries is handled as one run.
  let start = 0;
  let widest = -1;
  for (let i = 0; i < count; i++) {
    const next = order[(i + 1) % count].longitude;
    const gap = count === 1 ? 360 : normalize(next - order[i].longitude) || 360;
    if (gap > widest) {
      widest = gap;
      start = (i + 1) % count;
    }
  }
  const sequence = Array.from({ length: count }, (_, k) => order[(start + k) % count]);
  const base = sequence[0].longitude;
  const positions = sequence.map((item) => base + normalize(item.longitude - base));

  // Each group is centred on the mean of its members' true positions and
  // occupies (size - 1) * separation degrees. Groups that touch are merged.
  type Group = { first: number; size: number; center: number };
  const groups: Group[] = [];
  const halfWidth = (group: Group) => ((group.size - 1) * separation) / 2;
  for (let k = 0; k < count; k++) {
    groups.push({ first: k, size: 1, center: positions[k] });
    while (groups.length > 1) {
      const b = groups[groups.length - 1];
      const a = groups[groups.length - 2];
      const clearance = b.center - halfWidth(b) - (a.center + halfWidth(a));
      if (clearance >= separation - 1e-9) break;
      groups.pop();
      a.center = (a.center * a.size + b.center * b.size) / (a.size + b.size);
      a.size += b.size;
    }
  }

  const result = new Array<number>(count);
  for (const group of groups) {
    for (let k = 0; k < group.size; k++) {
      const angle = group.center - halfWidth(group) + k * separation;
      result[sequence[group.first + k].index] = normalize(angle);
    }
  }
  return result;
}

/**
 * Stroke width of an aspect line in pixels: linear from 4.5 at an exact
 * aspect to 0.8 at the maximum orb in force, T = 0.8 + 3.7 × (1 − |o| / O)
 * (decision supplement of 14 November 2026, point 1). The same orb gives the
 * same width for every aspect type that has the same maximum orb.
 */
export function aspectLineWidth(orb: number, maxOrb: number): number {
  if (!(maxOrb > 0)) return 0.8;
  const closeness = 1 - Math.min(Math.abs(orb), maxOrb) / maxOrb;
  return 0.8 + 3.7 * closeness;
}

/**
 * How far a label box reaches from its centre in the direction `theta`
 * (degrees, screen angle): half its width sideways, half its height up and
 * down. Labels stand upright wherever they are on the wheel.
 */
export function boxReach(theta: number, width: number, height: number): number {
  const radians = (theta * Math.PI) / 180;
  return (width / 2) * Math.abs(Math.cos(radians)) + (height / 2) * Math.abs(Math.sin(radians));
}

/**
 * Degrees two neighbouring upright labels must be apart along a circle of
 * `radius` so that they do not overlap. At the top and bottom of the wheel
 * they stand side by side and need their width; at the sides they stand
 * above each other and need their height.
 */
export function labelSeparation(
  theta: number,
  width: number,
  height: number,
  radius: number,
): number {
  const radians = (theta * Math.PI) / 180;
  const sideBySide = width / Math.max(Math.abs(Math.sin(radians)), 1e-6);
  const stacked = height / Math.max(Math.abs(Math.cos(radians)), 1e-6);
  const distance = Math.min(sideBySide, stacked);
  return (distance / Math.max(radius, 1)) * (180 / Math.PI);
}

/**
 * Like `spreadAngles`, but the room two neighbours need depends on where
 * they are and what they are: `gap(a, b, i, j)` is the least distance in
 * degrees between items `i` and `j` when shown at `a` and `b` (`a` before
 * `b`, not reduced to [0, 360)). Each run of crowded symbols is moved as
 * little as possible in total, keeping the zodiac order.
 *
 * `preferred` says where each symbol would like to stand when that is not
 * its longitude (see `keepInSign`). The order still follows the longitudes,
 * so the preferred angles must not change it.
 */
export function spreadAnglesBy(
  longitudes: number[],
  gap: (a: number, b: number, i: number, j: number) => number,
  preferred: number[] = longitudes,
): number[] {
  const count = longitudes.length;
  if (count === 0) return [];
  if (count === 1) return [normalize(longitudes[0])];

  const order = longitudes
    .map((longitude, index) => ({ index, longitude: normalize(longitude) }))
    .sort((a, b) => a.longitude - b.longitude);

  // Start after the widest empty stretch, so a group straddling 0° Aries is one run.
  let start = 0;
  let widest = -1;
  for (let i = 0; i < count; i++) {
    const next = order[(i + 1) % count].longitude;
    const stretch = normalize(next - order[i].longitude) || 360;
    if (stretch > widest) {
      widest = stretch;
      start = (i + 1) % count;
    }
  }
  const sequence = Array.from({ length: count }, (_, k) => order[(start + k) % count]);
  const base = sequence[0].longitude;
  const exact = sequence.map((item) => {
    const wish = normalize(preferred[item.index] - item.longitude);
    return base + normalize(item.longitude - base) + (wish > 180 ? wish - 360 : wish);
  });

  let shown = exact.slice();
  // The gaps depend on where the symbols end up, so settle in a few rounds.
  for (let round = 0; round < 6; round++) {
    const gaps: number[] = [];
    for (let k = 0; k + 1 < count; k++) {
      gaps.push(gap(shown[k], shown[k + 1], sequence[k].index, sequence[k + 1].index));
    }
    const closing = gap(shown[count - 1], shown[0] + 360, sequence[count - 1].index, sequence[0].index);
    const total = gaps.reduce((sum, value) => sum + value, 0) + closing;
    const scale = total > 360 ? 360 / total : 1;

    // With the gaps subtracted, "far enough apart" becomes "not decreasing":
    // the closest such sequence is found by pooling neighbours that violate it.
    const offsets = [0];
    for (const value of gaps) offsets.push(offsets[offsets.length - 1] + value * scale);
    const blocks: { sum: number; size: number }[] = [];
    for (let k = 0; k < count; k++) {
      blocks.push({ sum: exact[k] - offsets[k], size: 1 });
      while (blocks.length > 1) {
        const b = blocks[blocks.length - 1];
        const a = blocks[blocks.length - 2];
        if (a.sum / a.size <= b.sum / b.size + 1e-9) break;
        blocks.pop();
        a.sum += b.sum;
        a.size += b.size;
      }
    }
    const next: number[] = [];
    for (const block of blocks) {
      for (let k = 0; k < block.size; k++) next.push(block.sum / block.size + offsets[next.length]);
    }
    shown = next;
  }

  const result = new Array<number>(count);
  sequence.forEach((item, k) => {
    result[item.index] = normalize(shown[k]);
  });
  return result;
}

/**
 * Where a label would like to stand so that it stays inside the sign of its
 * longitude (feedback of 15 November 2026): the longitude itself, moved in
 * from a sign border by the room the label needs there. `before` and `after`
 * are that room in degrees at the start and the end of the sign. A label too
 * large for the sign stands in its middle.
 */
export function keepInSign(longitude: number, before: number, after: number): number {
  const exact = normalize(longitude);
  const start = Math.floor(exact / 30) * 30;
  const low = start + before;
  const high = start + 30 - after;
  if (low > high) return start + 15;
  return Math.min(Math.max(exact, low), high);
}
