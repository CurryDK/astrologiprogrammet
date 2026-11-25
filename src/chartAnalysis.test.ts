import { describe, expect, it } from "vitest";
import type { Condition, ConditionReport, PlanetCondition } from "./astro";
import {
  analysisGroups,
  analysisLines,
  lordRelationOf,
  modalityOf,
  sectRoleOf,
  sectSideOf,
  selfRulerships,
} from "./chartAnalysis";
import fixture from "./dev/fixture.json";
import { DEFAULT_SETTINGS } from "./settings";

const report = fixture.devCondition as unknown as ConditionReport;
const allGroups = DEFAULT_SETTINGS.condition.groups;

const condition = (fields: Partial<Condition>): Condition => ({
  kind: "copresence",
  group: "copresence",
  rating: null,
  others: [],
  aspect: null,
  orb: null,
  applying: null,
  sectRole: null,
  favored: null,
  sameSect: null,
  triplicityRole: null,
  angle: null,
  dignities: [],
  returnDignities: [],
  bodily: null,
  breakers: [],
  suppressed: false,
  ...fields,
});

const planet = (fields: Partial<PlanetCondition>): PlanetCondition => ({
  ...report.planets[0],
  conditions: [],
  ...fields,
});

/** A report with the given sect in which every planet has the sect condition a real one would. */
function reportOf(sect: "day" | "night", mercury: "diurnal" | "nocturnal" | null): ConditionReport {
  const diurnal = ["sun", "jupiter", "saturn"];
  const role = { sun: "leader", moon: "leader", venus: "benefic", jupiter: "benefic", mars: "malefic", saturn: "malefic" };
  return {
    ...report,
    sect,
    planets: report.planets.map((p) => {
      const own = p.body === "mercury" ? mercury : diurnal.includes(p.body) ? "diurnal" : "nocturnal";
      const favored = own === (sect === "day" ? "diurnal" : "nocturnal");
      return {
        ...p,
        sect: own,
        conditions: own
          ? [
              condition({
                kind: favored ? "sectFavored" : "sectContrary",
                group: "sect",
                sectRole: (role as Record<string, Condition["sectRole"]>)[p.body] ?? null,
              }),
            ]
          : [],
      };
    }),
  };
}

const bodies = (r: ConditionReport) => analysisGroups(r).map((g) => [g.title, g.planets.map((p) => p.body)]);

describe("Chart Analysis grouping", () => {
  it("puts the sect in favour first in a day chart, Mercury by its own sect", () => {
    expect(bodies(reportOf("day", "diurnal"))).toEqual([
      ["Favored sect: day", ["sun", "jupiter", "saturn", "mercury"]],
      ["Contrary sect: night", ["moon", "venus", "mars"]],
    ]);
    expect(bodies(reportOf("day", "nocturnal"))).toEqual([
      ["Favored sect: day", ["sun", "jupiter", "saturn"]],
      ["Contrary sect: night", ["moon", "venus", "mars", "mercury"]],
    ]);
  });

  it("turns the groups around in a night chart", () => {
    expect(bodies(reportOf("night", "nocturnal"))).toEqual([
      ["Favored sect: night", ["moon", "venus", "mars", "mercury"]],
      ["Contrary sect: day", ["sun", "jupiter", "saturn"]],
    ]);
  });

  it("places Mercury in neither group when its sect is undetermined", () => {
    const groups = analysisGroups(reportOf("day", null));
    expect(groups.map((g) => g.side)).toEqual(["favored", "contrary", "undetermined"]);
    expect(groups[2].planets.map((p) => p.body)).toEqual(["mercury"]);
    expect(sectRoleOf(groups[2].planets[0])).toBe("Sect uafklaret");
  });

  it("names the roles of both sects", () => {
    const roles = (r: ConditionReport) => Object.fromEntries(r.planets.map((p) => [p.body, sectRoleOf(p)]));
    expect(roles(reportOf("day", "diurnal"))).toEqual({
      sun: "Sect leader",
      jupiter: "Favored benefic",
      saturn: "Favored malefic",
      mercury: "Diurnal",
      moon: "Contrary sect leader",
      venus: "Contrary benefic",
      mars: "Contrary malefic",
    });
    expect(roles(reportOf("night", "nocturnal")).mars).toBe("Favored malefic");
    expect(roles(reportOf("night", "nocturnal")).mercury).toBe("Nocturnal");
  });

  it("shows every planet of the real report exactly once", () => {
    const shown = analysisGroups(report).flatMap((g) => g.planets.map((p) => p.body));
    expect([...shown].sort()).toEqual(report.planets.map((p) => p.body).sort());
    for (const p of report.planets) expect(sectSideOf(p)).not.toBe("undetermined");
  });
});

describe("Chart Analysis table", () => {
  it("knows the modality of each sign", () => {
    expect([modalityOf("aries"), modalityOf("taurus"), modalityOf("gemini"), modalityOf("capricorn")]).toEqual([
      "cardinal",
      "fixed",
      "mutable",
      "cardinal",
    ]);
  });

  it("reads the domicile lord's relation from the core's condition", () => {
    const lords = { ...report.planets[0].lords, domicile: "mars" as const };
    const at = (c: Partial<Condition>) =>
      lordRelationOf(planet({ body: "venus", lords, conditions: [condition({ group: "domicileLord", ...c })] }));
    expect(at({ kind: "lordWitness", aspect: "trine" })).toEqual({ kind: "witness", aspect: "trine" });
    expect(at({ kind: "lordCopresent" })).toEqual({ kind: "copresent" });
    expect(at({ kind: "lordAversion" })).toEqual({ kind: "aversion" });
    expect(lordRelationOf(planet({ body: "mars", lords }))).toEqual({ kind: "self" });
  });

  it("marks self rulership only where the planet is its own lord", () => {
    const lords = {
      domicile: "sun" as const,
      exaltation: null,
      triplicity: ["sun" as const, "jupiter" as const, "saturn" as const],
      bounds: "mars" as const,
      decan: "jupiter" as const,
    };
    expect(selfRulerships(planet({ body: "sun", lords }))).toEqual({
      domicile: true,
      exaltation: false,
      bounds: false,
      triplicity: true,
      decan: false,
    });
    expect(selfRulerships(planet({ body: "jupiter", lords })).decan).toBe(true);
  });
});

describe("Chart Analysis lines", () => {
  it("lists every non-sect condition of the report once, with the report's own rating", () => {
    for (const p of report.planets) {
      const lines = analysisLines(p, allGroups, true);
      const expected = p.conditions.filter((c) => c.group !== "sect");
      expect(lines.length).toBe(expected.length);
      expect(new Set(lines.map((l) => l.condition)).size).toBe(expected.length);
      for (const line of lines) expect(line.rating).toBe(line.condition.rating);
    }
  });

  it("orders from very supportive over neutral to very challenging", () => {
    const p = planet({
      conditions: [
        condition({ kind: "fall", group: "dignities", rating: "challenging" }),
        condition({ kind: "decan", group: "dignities" }),
        condition({ kind: "combust", group: "sun", rating: "veryChallenging", orb: 4 }),
        condition({ kind: "joyHouse", group: "joys", rating: "supportive" }),
        condition({ kind: "cazimi", group: "sun", rating: "verySupportive", orb: 0.5 }),
      ],
    });
    expect(analysisLines(p, allGroups, true).map((l) => l.rating)).toEqual([
      "verySupportive",
      "supportive",
      null,
      "challenging",
      "veryChallenging",
    ]);
    expect(analysisLines(p, allGroups, false).some((l) => l.rating === null)).toBe(false);
  });

  it("follows the categories switched off in Planetary Condition", () => {
    const p = planet({ conditions: [condition({ kind: "fall", group: "dignities", rating: "challenging" })] });
    expect(analysisLines(p, { ...allGroups, dignities: false }, true)).toEqual([]);
  });

  it("names a rated bonification or maltreatment, and the planet involved", () => {
    const line = (c: Partial<Condition>) => analysisLines(planet({ conditions: [condition(c)] }), allGroups, true)[0].text;
    expect(
      line({ kind: "signOpposition", group: "maltreatment", rating: "veryChallenging", others: ["mars"], aspect: "opposition" }),
    ).toBe("Maltreatment: Opposition fra malefic · Mars, opposition");
    expect(
      line({ kind: "enclosureBroken", group: "bonification", others: ["venus", "jupiter"], bodily: true, breakers: [{ body: "moon", aspect: null }] }),
    ).toMatch(/^Enclosure brudt · /);
    expect(line({ kind: "nearAngle", group: "houses", orb: 2, angle: "midheaven" })).toBe("Angular · 2°00′ fra MC");
  });
});
