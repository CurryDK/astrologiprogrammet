// Which transit aspects a Live Chart shows: the user's choice of bodies per
// layer, and the Time Lord filters (specification §8).

import {
  isBody,
  type Aspect,
  type Body,
  type BodyPosition,
  type PointId,
  type ProfectionYear,
  type TransitAspect,
} from "./astro";
import type { Settings } from "./settings";

/**
 * The planets the switched-on filters point at, or null when no filter is
 * on. The filters combine by adding up: a planet named by any of them counts.
 *
 * - Year's Time Lord and month's Time Lord: that planet, whether it is the
 *   transiting planet or the natal one.
 * - Planets in the year's profection sign: natal planets placed in that
 *   sign, and transiting planets passing through it.
 */
export function filterPlanets(
  filters: Settings["transits"]["filters"],
  profection: ProfectionYear | null,
  profectionMonth: number | null,
  natal: BodyPosition[],
  transit: BodyPosition[],
): { natal: Set<Body>; transit: Set<Body> } | null {
  if (!filters.yearLord && !filters.monthLord && !filters.profectionSign) return null;
  const sets = { natal: new Set<Body>(), transit: new Set<Body>() };
  // Without a profection (a moment before the birth) nothing matches.
  if (!profection) return sets;
  const both = (body: Body) => {
    sets.natal.add(body);
    sets.transit.add(body);
  };
  if (filters.yearLord) both(profection.timeLord);
  if (filters.monthLord) {
    const month = profection.months.find((m) => m.number === profectionMonth);
    if (month) both(month.ruler);
  }
  if (filters.profectionSign) {
    for (const p of natal) if (p.sign === profection.sign) sets.natal.add(p.body);
    for (const p of transit) if (p.sign === profection.sign) sets.transit.add(p.body);
  }
  return sets;
}

type Planets = ReturnType<typeof filterPlanets>;

const natalPointOn = (point: PointId, settings: Settings, view: "wheel" | "table") =>
  isBody(point)
    ? settings.inAspects[point] && (view === "table" || settings.showInWheel[point])
    : settings.angleAspects[view][point];

const transitBodyOn = (body: Body, settings: Settings, view: "wheel" | "table") =>
  settings.transits.inAspects[body] && (view === "table" || settings.transits.showInWheel[body]);

/** Transit → natal aspects to show in one view. */
export function transitToNatalForView(
  aspects: TransitAspect[],
  settings: Settings,
  view: "wheel" | "table",
  planets: Planets,
): TransitAspect[] {
  if (!settings.transits.groups.toNatal) return [];
  return aspects.filter(
    (aspect) =>
      transitBodyOn(aspect.transit, settings, view) &&
      natalPointOn(aspect.natal, settings, view) &&
      (planets === null ||
        planets.transit.has(aspect.transit) ||
        (isBody(aspect.natal) && planets.natal.has(aspect.natal))),
  );
}

/** Transit → transit aspects to show in one view. */
export function transitToTransitForView(
  aspects: Aspect[],
  settings: Settings,
  view: "wheel" | "table",
  planets: Planets,
): Aspect[] {
  if (!settings.transits.groups.toTransit) return [];
  return aspects.filter((aspect) => {
    const ends = [aspect.a, aspect.b].filter(isBody);
    return (
      ends.length === 2 &&
      ends.every((body) => transitBodyOn(body, settings, view)) &&
      (planets === null || ends.some((body) => planets.transit.has(body)))
    );
  });
}
