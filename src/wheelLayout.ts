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
