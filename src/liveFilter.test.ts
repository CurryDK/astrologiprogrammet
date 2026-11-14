import { describe, expect, it } from "vitest";
import type { Aspect, Body, BodyPosition, ProfectionYear, Sign, TransitAspect } from "./astro";
import { filterPlanets, transitToNatalForView, transitToTransitForView } from "./liveFilter";
import { DEFAULT_SETTINGS, type Settings } from "./settings";

const position = (body: Body, sign: Sign): BodyPosition => ({
  body,
  sign,
  longitude: 0,
  degree: 0,
  minute: 0,
  latitude: 0,
  speed: 1,
  retrograde: false,
  house: 1,
});

const moment = { utc: "", local: "", offsetSeconds: 0 };

// Year: Scorpio, Mars. Month 2: Sagittarius, Jupiter.
const profection: ProfectionYear = {
  age: 64,
  start: moment,
  end: moment,
  house: 5,
  sign: "scorpio",
  timeLord: "mars",
  months: [
    { number: 1, start: moment, end: moment, house: 5, sign: "scorpio", ruler: "mars" },
    { number: 2, start: moment, end: moment, house: 6, sign: "sagittarius", ruler: "jupiter" },
  ],
};

const natal = [position("sun", "aquarius"), position("neptune", "scorpio"), position("mars", "capricorn")];
const transit = [position("sun", "scorpio"), position("venus", "libra"), position("jupiter", "leo")];

const toNatal = (t: Body, n: TransitAspect["natal"]): TransitAspect => ({
  transit: t,
  natal: n,
  kind: "trine",
  orb: 1,
  applying: true,
  outOfSign: false,
});

const toTransit = (a: Body, b: Body): Aspect => ({
  a,
  b,
  kind: "square",
  orb: 1,
  applying: true,
  outOfSign: false,
});

const withTransits = (change: Partial<Settings["transits"]>): Settings => ({
  ...DEFAULT_SETTINGS,
  transits: { ...DEFAULT_SETTINGS.transits, ...change },
});

const off = { yearLord: false, monthLord: false, profectionSign: false };

describe("filterPlanets", () => {
  it("is null when no filter is on", () => {
    expect(filterPlanets(off, profection, 2, natal, transit)).toBeNull();
  });

  it("names the year's Time Lord on both sides", () => {
    const sets = filterPlanets({ ...off, yearLord: true }, profection, 2, natal, transit)!;
    expect([...sets.natal]).toEqual(["mars"]);
    expect([...sets.transit]).toEqual(["mars"]);
  });

  it("names the Time Lord of the month that holds the moment", () => {
    const sets = filterPlanets({ ...off, monthLord: true }, profection, 2, natal, transit)!;
    expect([...sets.transit]).toEqual(["jupiter"]);
  });

  it("names natal planets in the profection sign and transiting planets passing through it", () => {
    const sets = filterPlanets({ ...off, profectionSign: true }, profection, 2, natal, transit)!;
    expect([...sets.natal]).toEqual(["neptune"]);
    expect([...sets.transit]).toEqual(["sun"]);
  });

  it("adds the filters up when several are on", () => {
    const all = { yearLord: true, monthLord: true, profectionSign: true };
    const sets = filterPlanets(all, profection, 2, natal, transit)!;
    expect([...sets.natal].sort()).toEqual(["jupiter", "mars", "neptune"]);
    expect([...sets.transit].sort()).toEqual(["jupiter", "mars", "sun"]);
  });

  it("matches nothing before the birth", () => {
    const sets = filterPlanets({ ...off, yearLord: true }, null, null, natal, transit)!;
    expect(sets.natal.size + sets.transit.size).toBe(0);
  });
});

describe("transit aspects for a view", () => {
  const aspects = [
    toNatal("mars", "sun"),
    toNatal("venus", "mars"),
    toNatal("venus", "sun"),
    toNatal("venus", "ascendant"),
    toNatal("southNode", "sun"),
  ];

  it("shows the whole group without filters, minus bodies switched off", () => {
    const shown = transitToNatalForView(aspects, withTransits({}), "table", null);
    // The transiting south node is off by default; natal angles are on in the table.
    expect(shown).toHaveLength(4);
    expect(transitToNatalForView(aspects, withTransits({}), "wheel", null)).toHaveLength(3);
  });

  it("is empty when the group is switched off", () => {
    const settings = withTransits({ groups: { natal: false, toNatal: false, toTransit: true } });
    expect(transitToNatalForView(aspects, settings, "table", null)).toEqual([]);
  });

  it("keeps aspects where a filter planet is the transiting or the natal planet", () => {
    const planets = filterPlanets({ ...off, yearLord: true }, profection, 2, natal, transit);
    const shown = transitToNatalForView(aspects, withTransits({}), "table", planets);
    expect(shown.map((a) => `${a.transit}-${a.natal}`)).toEqual(["mars-sun", "venus-mars"]);
  });

  it("uses the transit layer's own body choices, not the natal ones", () => {
    const settings = withTransits({
      inAspects: { ...DEFAULT_SETTINGS.transits.inAspects, venus: false },
    });
    const shown = transitToNatalForView(aspects, settings, "table", null);
    expect(shown.map((a) => a.transit)).toEqual(["mars"]);
    // Natal Venus is untouched by that choice.
    expect(settings.inAspects.venus).toBe(true);
  });

  it("filters transit → transit by either transiting body", () => {
    const settings = withTransits({ groups: { natal: false, toNatal: true, toTransit: true } });
    const pairs = [toTransit("sun", "mars"), toTransit("venus", "jupiter"), toTransit("sun", "venus")];
    expect(transitToTransitForView(pairs, settings, "table", null)).toHaveLength(3);
    const planets = filterPlanets({ ...off, yearLord: true }, profection, 2, natal, transit);
    expect(transitToTransitForView(pairs, settings, "table", planets)).toEqual([pairs[0]]);
    expect(transitToTransitForView(pairs, withTransits({}), "table", null)).toEqual([]);
  });
});
