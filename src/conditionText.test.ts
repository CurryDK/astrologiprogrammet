import { describe, expect, it } from "vitest";
import { CONDITION_GROUPS, type Condition, type ConditionReport } from "./astro";
import { CONDITION_ROWS, GROUP_NAMES, conditionDetail, rowOf } from "./conditionText";
import fixture from "./dev/fixture.json";
import { DEFAULT_SETTINGS, settingsFromStored } from "./settings";

const report = fixture.devCondition as unknown as ConditionReport;

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
  triplicityRole: null,
  angle: null,
  dignities: [],
  returnDignities: [],
  bodily: null,
  breakers: [],
  suppressed: false,
  ...fields,
});

describe("Planetary Condition texts", () => {
  it("has a row with rule and source for every condition the core reports", () => {
    for (const planet of report.planets) {
      for (const c of planet.conditions) {
        const row = rowOf(c);
        expect(row, `${c.group}.${c.kind}`).toBeDefined();
        expect(row!.rule.length).toBeGreaterThan(10);
        expect(row!.source.length).toBeGreaterThan(5);
      }
    }
  });

  it("has no duplicate rows and names every group", () => {
    const keys = CONDITION_ROWS.map((r) => `${r.group}.${r.kind}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const group of CONDITION_GROUPS) {
      expect(GROUP_NAMES[group]).toBeTruthy();
      expect(CONDITION_ROWS.some((r) => r.group === group)).toBe(true);
    }
  });

  it("offers no row for the undecided or rejected conditions", () => {
    // Striking with a ray from a benefic is undecided; counteraction is rejected.
    expect(rowOf({ group: "bonification", kind: "strikingRay" })).toBeUndefined();
    expect(CONDITION_ROWS.some((r) => /counteraction/i.test(r.label))).toBe(false);
  });

  it("covers only the seven traditional planets", () => {
    expect(report.planets.map((p) => p.body)).toEqual([
      "sun",
      "moon",
      "mercury",
      "venus",
      "mars",
      "jupiter",
      "saturn",
    ]);
  });

  it("describes a degree-based condition with aspect, orb and motion", () => {
    const text = conditionDetail(
      condition({
        kind: "engagement",
        group: "maltreatment",
        others: ["saturn"],
        aspect: "square",
        orb: 1.5,
        applying: true,
      }),
    );
    expect(text).toBe("Saturn, kvadrat 1°30′, applicerende");
  });

  it("says stationary/undetermined instead of forcing applying or separating", () => {
    const text = conditionDetail(
      condition({ kind: "engagement", group: "maltreatment", others: ["mars"], aspect: "square", orb: 2 }),
    );
    expect(text).toContain("stationær/uafklaret");
  });

  it("names what breaks an enclosure", () => {
    const text = conditionDetail(
      condition({
        kind: "enclosureBroken",
        group: "maltreatment",
        others: ["mars", "saturn"],
        bodily: true,
        breakers: [
          { body: "moon", aspect: null },
          { body: "sun", aspect: "trine" },
        ],
      }),
    );
    expect(text).toBe("Mars og Saturn, ved kroppene · brudt af Månen (krop) og Solen (trigon)");
  });

  it("marks the square of overcoming as Upon the Tenth and the hidden rating under chariot", () => {
    expect(
      conditionDetail(condition({ kind: "overcomes", group: "overcoming", others: ["mars"], aspect: "square" })),
    ).toBe("Mars, kvadrat (Upon the Tenth)");
    expect(
      conditionDetail(condition({ kind: "combust", group: "sun", orb: 4, suppressed: true })),
    ).toContain("skjult af chariot");
  });

  it("labels co-presence with a benefic or malefic by sect", () => {
    expect(
      conditionDetail(condition({ others: ["jupiter"], favored: true, rating: "verySupportive" })),
    ).toBe("Jupiter (favored benefic)");
    expect(
      conditionDetail(condition({ others: ["mars"], favored: false, rating: "veryChallenging" })),
    ).toBe("Mars (contrary malefic)");
    expect(conditionDetail(condition({ others: ["moon"] }))).toBe("Månen");
  });
});

describe("Planetary Condition settings", () => {
  it("defaults to the decided limits with every category shown", () => {
    const { condition: c } = DEFAULT_SETTINGS;
    expect([c.cazimi, c.combust, c.beams]).toEqual([1, 8, 15]);
    expect(CONDITION_GROUPS.every((group) => c.groups[group])).toBe(true);
  });

  it("gives settings saved by an older version the new defaults", () => {
    const stored = { orbs: { conjunction: 5 } };
    const merged = settingsFromStored(stored);
    expect(merged.orbs.conjunction).toBe(5);
    expect(merged.condition).toEqual(DEFAULT_SETTINGS.condition);
  });

  it("keeps a stored limit, colour and category choice", () => {
    const merged = settingsFromStored({
      condition: { combust: 9, colors: { supportive: "#123456" }, groups: { reception: false } },
    });
    expect(merged.condition.combust).toBe(9);
    expect(merged.condition.cazimi).toBe(1);
    expect(merged.condition.colors.supportive).toBe("#123456");
    expect(merged.condition.groups.reception).toBe(false);
    expect(merged.condition.groups.sect).toBe(true);
  });
});
