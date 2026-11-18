// Danish wording of exact events and aspect courses (event search, aspect
// timing report, year-lord report). Words only; nothing is decided here.

import {
  ASPECT_NAMES,
  BODIES,
  POINT_NAMES,
  SIGN_NAMES,
  isBody,
  type AspectKind,
  type Body,
  type Layer,
  type LayerPoint,
  type PointId,
  type SearchEvent,
  type SynodicKind,
  type CycleStatus,
  type RetroCycle,
  type RetroEvent,
  type RetroPhase,
} from "./astro";
import type { Settings } from "./settings";

export const LAYER_NAMES: Record<Layer, string> = {
  transit: "Transit",
  progressed: "Progressiv",
  natal: "natal",
};

/** "Transit Mars", "Progressiv ASC", "natal Solen". */
export function layerPointName(point: LayerPoint): string {
  const name = point.point === "ascendant" ? "ASC" : point.point === "midheaven" ? "MC" : POINT_NAMES[point.point];
  return `${LAYER_NAMES[point.layer]} ${name}`;
}

/** The eight progressed lunation phases, by eighths of the cycle. */
export const LUNATION_NAMES = [
  "Progressiv nymåne",
  "Progressiv lunationsfase 45°",
  "Progressivt første kvarter",
  "Progressiv lunationsfase 135°",
  "Progressiv fuldmåne",
  "Progressiv lunationsfase 225°",
  "Progressivt sidste kvarter",
  "Progressiv lunationsfase 315°",
];

export const SYNODIC_NAMES: Record<SynodicKind, string> = {
  conjunction: "Konjunktion",
  superiorConjunction: "Øvre konjunktion",
  inferiorConjunction: "Nedre konjunktion",
  opposition: "Opposition",
};

/** Where a planet is in its retrograde cycle (decision "Planetcyklusser", point 20). */
export const RETRO_PHASE_NAMES: Record<RetroPhase, string> = {
  direct: "Direkte",
  preShadow: "Forskygge",
  retrograde: "Retrograd",
  postShadow: "Efterskygge",
  postAndPreShadow: "Efterskygge og forskygge",
};

export const CYCLE_STATUS_NAMES: Record<CycleStatus, string> = {
  completed: "Seneste afsluttede retrogradperiode",
  current: "Aktuel retrogradperiode",
  next: "Næste retrogradperiode",
};

/** What happens at an event of a retrograde cycle, naming the sign where one is involved. */
export function retroEventText(event: RetroEvent, cycle: RetroCycle): string {
  const retrogradeSign = SIGN_NAMES[cycle.sign];
  switch (event.kind) {
    case "signEntry":
      return `Indtræden i ${retrogradeSign}`;
    case "shadowEntry":
      return "Indtræden i forskyggen";
    case "stationRetrograde":
      return "Retrograd stationering";
    case "signChange":
      return `Tegnskift til ${SIGN_NAMES[event.position.sign]}`;
    case "stationDirect":
      return "Direkte stationering";
    case "signReentry":
      return `Genindtræden i ${retrogradeSign}`;
    case "shadowExit":
      return "Udtræden af efterskyggen";
    case "signExit":
      return `Endelig udtræden af ${retrogradeSign}`;
  }
}

/** One line saying what happens at an exact event. */
export function eventText(event: SearchEvent): string {
  const backwards = (retrograde: boolean) => (retrograde ? " (retrograd)" : "");
  switch (event.type) {
    case "aspect":
      return `${layerPointName(event.a)} ${ASPECT_NAMES[event.kind].toLowerCase()} ${layerPointName(event.b)}`;
    case "signChange":
      return `${layerPointName(event.point)} går ind i ${SIGN_NAMES[event.sign]}${backwards(event.retrograde)}`;
    case "station":
      return `${layerPointName(event.point)} stationerer ${event.turns === "retrograde" ? "retrograd" : "direkte"}`;
    case "moonHouse":
      return `Progressiv Månen går ind i ${event.house}. natalhus (${SIGN_NAMES[event.sign]})`;
    case "lunation":
      return LUNATION_NAMES[event.phase] ?? "Progressiv lunationsfase";
    case "boundChange":
      return `${layerPointName(event.point)} går ind i ${POINT_NAMES[event.lord]}s bound${backwards(event.retrograde)}`;
    case "decanChange":
      return `${layerPointName(event.point)} går ind i ${POINT_NAMES[event.lord]}s dekan${backwards(event.retrograde)}`;
  }
}

/** The kind of an event, for grouping and filtering in a list. */
export const EVENT_TYPE_NAMES: Record<SearchEvent["type"], string> = {
  aspect: "Aspekt",
  signChange: "Tegnskift",
  station: "Stationering",
  moonHouse: "Husskift",
  lunation: "Lunationsfase",
  boundChange: "Bound",
  decanChange: "Dekan",
};

/** A count of days as "3 dage", "1 dag" or "under 1 dag"; whole days, never rounded up. */
export function formatDays(days: number): string {
  const whole = Math.floor(Math.abs(days));
  if (whole === 0) return "under 1 dag";
  return whole === 1 ? "1 dag" : `${whole} dage`;
}

/** Days from a reference moment: "for 12 dage siden" or "om 3 dage". */
export function formatDaysFrom(days: number): string {
  return days < 0 ? `for ${formatDays(days)} siden` : `om ${formatDays(days)}`;
}

/** The objects that take part in a search or report. */
export type PointChoice = {
  transitBodies: Body[];
  progressedPoints: PointId[];
  natalPoints: PointId[];
  kinds: AspectKind[];
};

/**
 * The objects to start from: the bodies and angles switched on for aspects
 * in Live Chart and at the natal chart, and every aspect kind.
 */
export function defaultPointChoice(settings: Settings): PointChoice {
  return {
    transitBodies: BODIES.filter((body) => settings.transits.inAspects[body]),
    progressedPoints: (Object.keys(settings.progressions.inAspects) as PointId[]).filter(
      (point) => settings.progressions.inAspects[point],
    ),
    natalPoints: [
      ...BODIES.filter((body) => settings.inAspects[body]),
      ...(["ascendant", "midheaven"] as const).filter((angle) => settings.angleAspects.table[angle]),
    ],
    kinds: ["conjunction", "sextile", "square", "trine", "opposition"],
  };
}

/** Whether a point is a body or an angle name the layer can hold. */
export function allowedIn(layer: Layer, point: PointId): boolean {
  return layer !== "transit" || isBody(point);
}
