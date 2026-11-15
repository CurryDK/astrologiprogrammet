// Chart Analysis (specification of 15 November 2026): how the Planetary
// Condition report is arranged into the compact overview. Nothing here
// decides a condition or a rating; it only groups, orders and words what
// the Rust core reported, so the two overviews cannot disagree.

import {
  SIGNS,
  type AspectKind,
  type Condition,
  type ConditionGroup,
  type ConditionReport,
  type PlanetCondition,
  type Rating,
  type Sign,
} from "./astro";
import { conditionDetail, rowOf } from "./conditionText";

export type Modality = "cardinal" | "fixed" | "mutable";

export const MODALITY_NAMES: Record<Modality, string> = {
  cardinal: "Kardinal",
  fixed: "Fast",
  mutable: "Bevægelig",
};

export function modalityOf(sign: Sign): Modality {
  return (["cardinal", "fixed", "mutable"] as const)[SIGNS.indexOf(sign) % 3];
}

/** Where a planet stands by sect: with the sect in favour, against it, or not determined. */
export type SectSide = "favored" | "contrary" | "undetermined";

/** Read from the sect condition the core gave the planet; none means undetermined. */
export function sectSideOf(planet: PlanetCondition): SectSide {
  if (planet.conditions.some((c) => c.kind === "sectFavored")) return "favored";
  if (planet.conditions.some((c) => c.kind === "sectContrary")) return "contrary";
  return "undetermined";
}

/**
 * The sect role shown in a planet's heading. Mercury has no fixed role: it
 * is diurnal or nocturnal by its computed sect, and "uafklaret" exactly
 * conjunct the Sun, where it must not be placed in either group.
 */
export function sectRoleOf(planet: PlanetCondition): string {
  const side = sectSideOf(planet);
  const role = planet.conditions.find((c) => c.kind === "sectFavored" || c.kind === "sectContrary")?.sectRole;
  if (side === "undetermined") return "Sect uafklaret";
  if (role === "leader") return side === "favored" ? "Sect leader" : "Contrary sect leader";
  if (role === "benefic") return side === "favored" ? "Favored benefic" : "Contrary benefic";
  if (role === "malefic") return side === "favored" ? "Favored malefic" : "Contrary malefic";
  return planet.sect === "diurnal" ? "Diurnal" : "Nocturnal";
}

export type AnalysisGroup = { side: SectSide; title: string; planets: PlanetCondition[] };

const ROLE_ORDER = ["leader", "benefic", "malefic"];

function roleRank(planet: PlanetCondition): number {
  const role = planet.conditions.find((c) => c.kind === "sectFavored" || c.kind === "sectContrary")?.sectRole;
  const rank = role ? ROLE_ORDER.indexOf(role) : -1;
  return rank === -1 ? ROLE_ORDER.length : rank;
}

/**
 * The planets grouped as in the reference: the sect in favour first
 * (leader, benefic, malefic), then the contrary sect, Mercury last in the
 * group its sect puts it in. A planet whose sect is undetermined gets a
 * group of its own. Empty groups are left out.
 */
export function analysisGroups(report: ConditionReport): AnalysisGroup[] {
  const favoredSect = report.sect === "day" ? "day" : "night";
  const contrarySect = report.sect === "day" ? "night" : "day";
  const titles: Record<SectSide, string> = {
    favored: `Favored sect: ${favoredSect}`,
    contrary: `Contrary sect: ${contrarySect}`,
    undetermined: "Sect uafklaret",
  };
  return (["favored", "contrary", "undetermined"] as const)
    .map((side) => ({
      side,
      title: titles[side],
      planets: report.planets
        .filter((planet) => sectSideOf(planet) === side)
        .sort((a, b) => roleRank(a) - roleRank(b)),
    }))
    .filter((group) => group.planets.length > 0);
}

/** How a planet's domicile lord stands to it, read from the core's domicile-lord condition. */
export type LordRelation =
  | { kind: "self" }
  | { kind: "copresent" }
  | { kind: "witness"; aspect: AspectKind }
  | { kind: "aversion" }
  | null;

export function lordRelationOf(planet: PlanetCondition): LordRelation {
  if (planet.lords.domicile === planet.body) return { kind: "self" };
  for (const c of planet.conditions) {
    if (c.kind === "lordCopresent") return { kind: "copresent" };
    if (c.kind === "lordWitness" && c.aspect) return { kind: "witness", aspect: c.aspect };
    if (c.kind === "lordAversion") return { kind: "aversion" };
  }
  return null;
}

/** The lords of the place a planet stands in that are the planet itself ("self rulership"). */
export function selfRulerships(planet: PlanetCondition) {
  const { body, lords } = planet;
  return {
    domicile: lords.domicile === body,
    exaltation: lords.exaltation === body,
    bounds: lords.bounds === body,
    triplicity: lords.triplicity.includes(body),
    decan: lords.decan === body,
  };
}

export type AnalysisLine = {
  condition: Condition;
  /** Null for a neutral fact. */
  rating: Rating | null;
  text: string;
  /** The rule, for the tooltip. */
  rule: string;
};

// Most supportive first, neutral facts in the middle, most challenging last.
const RATING_ORDER: (Rating | null)[] = ["verySupportive", "supportive", null, "challenging", "veryChallenging"];

const PREFIX: Partial<Record<ConditionGroup, string>> = {
  bonification: "Bonification",
  maltreatment: "Maltreatment",
};

/**
 * The condition lines of one planet. Sect is left out because the heading
 * states it; every other condition of a shown category gets one line, in
 * the order the core reported them within each rating, so nothing is
 * counted twice or merged.
 */
export function analysisLines(
  planet: PlanetCondition,
  groups: Record<ConditionGroup, boolean>,
  showNeutral: boolean,
): AnalysisLine[] {
  return planet.conditions
    .filter((c) => c.group !== "sect" && groups[c.group] && (showNeutral || c.rating !== null))
    .map((condition) => {
      const row = rowOf(condition);
      const label = row?.label ?? condition.kind;
      // Only a rated condition is a bonification or maltreatment; a broken
      // enclosure or a bare relation keeps its plain name.
      const prefix = condition.rating !== null ? PREFIX[condition.group] : undefined;
      const detail = conditionDetail(condition);
      return {
        condition,
        rating: condition.rating,
        text: `${prefix ? `${prefix}: ` : ""}${label}${detail ? ` · ${detail}` : ""}`,
        rule: row?.rule ?? "",
      };
    })
    .map((line, index) => ({ line, index }))
    .sort(
      (a, b) =>
        RATING_ORDER.indexOf(a.line.rating) - RATING_ORDER.indexOf(b.line.rating) || a.index - b.index,
    )
    .map(({ line }) => line);
}
