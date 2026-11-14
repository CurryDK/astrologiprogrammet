import { describe, expect, it } from "vitest";
import packageJson from "../package.json";
import { CHANGELOG } from "./changelog";

describe("changelog", () => {
  it("has an entry for the version being built, at the top", () => {
    expect(CHANGELOG[0].version).toBe(packageJson.version);
  });

  it("lists each version once and says something about every one", () => {
    const versions = CHANGELOG.map((entry) => entry.version);
    expect(new Set(versions).size).toBe(versions.length);
    for (const entry of CHANGELOG) {
      expect(entry.added.length + entry.changed.length).toBeGreaterThan(0);
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
