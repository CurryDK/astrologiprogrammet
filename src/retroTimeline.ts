// Layout of the graphic timeline of one retrograde cycle (decision
// "Planetcyklusser" of 18 November 2026, section 4). Geometry only: which
// events fit on the scale, where they stand, and where their labels go.

import type { RetroCycle, RetroEvent } from "./astro";

/** How far outside the shadow, as a share of its length, an event may lie and still be drawn to scale. */
const REACH = 0.6;
/** Empty room at each end of the scale, as a share of its length. */
const PADDING = 0.04;

export type TimelineMark = {
  event: RetroEvent;
  /** 0 at the left end of the scale, 1 at the right. */
  at: number;
};

export type TimelineBar = {
  kind: "preShadow" | "retrograde" | "postShadow";
  from: number;
  to: number;
};

export type Timeline = {
  marks: TimelineMark[];
  bars: TimelineBar[];
  /** Events too far away to draw to scale: named at the edge with their date. */
  before: RetroEvent[];
  after: RetroEvent[];
  /** Where the reference moment stands, or which edge it lies beyond. */
  reference: number | "before" | "after";
};

const time = (event: RetroEvent) => Date.parse(event.at.utc);

/**
 * The scale covers the shadow from start to end, widened to take in the
 * sign events and the reference moment where they lie near it. For the slow
 * planets a sign entry or exit can lie years away; those are listed at the
 * edge instead, so the retrograde period itself stays readable.
 */
export function timelineOf(cycle: RetroCycle, referenceUtc: string): Timeline {
  const find = (kind: RetroEvent["kind"]) => cycle.events.find((e) => e.kind === kind);
  const retrograde = find("stationRetrograde");
  const direct = find("stationDirect");
  const enter = find("shadowEntry");
  const leave = find("shadowExit");
  const core = [enter, retrograde, direct, leave].filter((e) => e !== undefined).map(time);
  if (core.length === 0) return { marks: [], bars: [], before: [], after: [], reference: "before" };
  const coreStart = Math.min(...core);
  const coreEnd = Math.max(...core);
  const span = Math.max(coreEnd - coreStart, 86_400_000);
  const earliest = coreStart - REACH * span;
  const latest = coreEnd + REACH * span;
  const reference = Date.parse(referenceUtc);

  const shown = cycle.events.filter((e) => time(e) >= earliest && time(e) <= latest);
  const inside = [...shown.map(time), ...(reference >= earliest && reference <= latest ? [reference] : [])];
  const first = Math.min(...inside);
  const last = Math.max(...inside);
  const padding = PADDING * Math.max(last - first, 86_400_000);
  const start = first - padding;
  const length = last + padding - start;
  const at = (ms: number) => (ms - start) / length;

  const bar = (kind: TimelineBar["kind"], from?: RetroEvent, to?: RetroEvent): TimelineBar[] =>
    from && to ? [{ kind, from: at(time(from)), to: at(time(to)) }] : [];

  return {
    marks: shown.map((event) => ({ event, at: at(time(event)) })),
    bars: [
      ...bar("preShadow", enter, retrograde),
      ...bar("retrograde", retrograde, direct),
      ...bar("postShadow", direct, leave),
    ],
    before: cycle.events.filter((e) => time(e) < earliest),
    after: cycle.events.filter((e) => time(e) > latest),
    reference: reference < earliest ? "before" : reference > latest ? "after" : at(reference),
  };
}

export type LabelPlace = {
  /** Centre of the label, moved in from the edges so the text stays inside. */
  x: number;
  /** Lanes are counted outwards from the line: 0 is nearest. */
  side: "above" | "below";
  lane: number;
};

/**
 * Places a label for each mark, given from left to right with the width of
 * its text: alternately above and below the line, moving outwards a lane
 * when the nearer ones are taken, so no two labels overlap.
 */
export function placeLabels(
  marks: { x: number; width: number }[],
  totalWidth: number,
  gap = 8,
): LabelPlace[] {
  /** Right edge of the last label in each lane. */
  const taken: Record<"above" | "below", number[]> = { above: [], below: [] };
  return marks.map((mark, index) => {
    const half = mark.width / 2;
    const x = Math.min(Math.max(mark.x, half), totalWidth - half);
    const left = x - half;
    const sides = index % 2 === 0 ? (["above", "below"] as const) : (["below", "above"] as const);
    for (let lane = 0; ; lane++) {
      for (const side of sides) {
        if ((taken[side][lane] ?? -Infinity) + gap <= left) {
          taken[side][lane] = x + half;
          return { x, side, lane };
        }
      }
    }
  });
}
