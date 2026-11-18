import { describe, expect, it } from "vitest";
import type { RetroCycle, RetroEvent } from "./astro";
import { placeLabels, timelineOf } from "./retroTimeline";

const day = 86_400_000;
const start = Date.parse("2025-03-15T00:00:00Z");

function event(kind: RetroEvent["kind"], days: number): RetroEvent {
  const utc = new Date(start + days * day).toISOString();
  return {
    kind,
    at: { utc, local: utc.slice(0, 19), offsetSeconds: 0 },
    position: { longitude: 0, sign: "aries", degree: 0, minute: 0 },
    days,
    nearest: false,
  };
}

const cycle = (entry: number, exit: number): RetroCycle => ({
  status: "current",
  sign: "aries",
  events: [
    event("signEntry", entry),
    event("shadowEntry", -15),
    event("stationRetrograde", 0),
    event("stationDirect", 23),
    event("shadowExit", 42),
    event("signExit", exit),
  ].sort((a, b) => a.days - b.days),
});

describe("timelineOf", () => {
  it("draws nearby sign events to scale, in order, with the three periods", () => {
    const timeline = timelineOf(cycle(-12, 56), new Date(start + 5 * day).toISOString());
    expect(timeline.marks.map((m) => m.event.kind)).toEqual([
      "shadowEntry",
      "signEntry",
      "stationRetrograde",
      "stationDirect",
      "shadowExit",
      "signExit",
    ]);
    expect(timeline.before).toEqual([]);
    expect(timeline.after).toEqual([]);
    const at = timeline.marks.map((m) => m.at);
    expect(at).toEqual([...at].sort((a, b) => a - b));
    expect(at[0]).toBeGreaterThan(0);
    expect(at[at.length - 1]).toBeLessThan(1);
    expect(timeline.bars.map((b) => b.kind)).toEqual(["preShadow", "retrograde", "postShadow"]);
    // The retrograde bar runs from one station to the other.
    expect(timeline.bars[1].from).toBeCloseTo(at[2]);
    expect(timeline.bars[1].to).toBeCloseTo(at[3]);
    expect(timeline.reference).toBeGreaterThan(at[2]);
    expect(timeline.reference).toBeLessThan(at[3]);
  });

  it("names far-away sign events and a far-away reference at the edge", () => {
    const timeline = timelineOf(cycle(-700, 6000), new Date(start + 400 * day).toISOString());
    expect(timeline.before.map((e) => e.kind)).toEqual(["signEntry"]);
    expect(timeline.after.map((e) => e.kind)).toEqual(["signExit"]);
    expect(timeline.marks).toHaveLength(4);
    expect(timeline.reference).toBe("after");
    expect(timelineOf(cycle(-700, 6000), new Date(start - 400 * day).toISOString()).reference).toBe("before");
  });
});

describe("placeLabels", () => {
  it("keeps labels apart and inside the width", () => {
    const marks = [5, 20, 30, 45, 400, 990].map((x) => ({ x, width: 120 }));
    const places = placeLabels(marks, 1000);
    for (const place of places) {
      expect(place.x - 60).toBeGreaterThanOrEqual(0);
      expect(place.x + 60).toBeLessThanOrEqual(1000);
    }
    for (let i = 0; i < places.length; i++) {
      for (let j = i + 1; j < places.length; j++) {
        const same = places[i].side === places[j].side && places[i].lane === places[j].lane;
        if (same) expect(Math.abs(places[i].x - places[j].x)).toBeGreaterThanOrEqual(120);
      }
    }
    // A label with room stands in the lane nearest the line.
    expect(places[4].lane).toBe(0);
  });
});
