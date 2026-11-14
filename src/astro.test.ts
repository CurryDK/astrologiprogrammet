import { describe, expect, it } from "vitest";
import { formatOffset, formatOrb, parseOffset } from "./astro";

describe("formatOrb", () => {
  it("truncates to whole minutes", () => {
    expect(formatOrb(2.2044736)).toBe("2°12′");
    expect(formatOrb(0)).toBe("0°00′");
    expect(formatOrb(6.999)).toBe("6°59′");
    expect(formatOrb(7)).toBe("7°00′");
  });
});

describe("formatOffset", () => {
  it("formats whole and odd offsets", () => {
    expect(formatOffset(3600)).toBe("+01:00");
    expect(formatOffset(-19800)).toBe("−05:30");
    expect(formatOffset(0)).toBe("+00:00");
    expect(formatOffset(3020)).toBe("+00:50:20");
  });
});

describe("parseOffset", () => {
  it("accepts the common ways of writing an offset", () => {
    expect(parseOffset("+1")).toBe(3600);
    expect(parseOffset("1")).toBe(3600);
    expect(parseOffset("+01:00")).toBe(3600);
    expect(parseOffset("-5:30")).toBe(-19800);
    expect(parseOffset("−05:30")).toBe(-19800);
    expect(parseOffset("1,5")).toBe(5400);
    expect(parseOffset("+00:50:20")).toBe(3020);
  });

  it("round-trips with formatOffset", () => {
    for (const seconds of [0, 3600, -19800, 3020, 45900]) {
      expect(parseOffset(formatOffset(seconds))).toBe(seconds);
    }
  });

  it("rejects nonsense", () => {
    expect(parseOffset("")).toBeNull();
    expect(parseOffset("abc")).toBeNull();
    expect(parseOffset("+25")).toBeNull();
    expect(parseOffset("1:75")).toBeNull();
  });
});
