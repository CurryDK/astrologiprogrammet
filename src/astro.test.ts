import { describe, expect, it } from "vitest";
import { formatLot, formatMoment, formatOffset, formatOrb, lotReading, parseOffset } from "./astro";

describe("formatOrb", () => {
  it("truncates to whole minutes", () => {
    expect(formatOrb(2.2044736)).toBe("2°12′");
    expect(formatOrb(0)).toBe("0°00′");
    expect(formatOrb(6.999)).toBe("6°59′");
    expect(formatOrb(7)).toBe("7°00′");
  });
});

describe("formatMoment", () => {
  it("shows the birthplace's date, with the clock time when asked", () => {
    const moment = { local: "2001-03-07T00:20:00" };
    expect(formatMoment(moment, false)).toBe("7. mar. 2001");
    expect(formatMoment(moment, true)).toBe("7. mar. 2001 kl. 00:20");
  });

  it("cuts seconds and fractions off instead of rounding up", () => {
    expect(formatMoment({ local: "2026-12-31T23:59:59.999999999" }, true)).toBe(
      "31. dec. 2026 kl. 23:59",
    );
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

describe("lot display", () => {
  // 12°34′31.2″ Taurus
  const lot = { longitude: 30 + 12 + 34 / 60 + 31.2 / 3600, sign: "taurus" as const };

  it("rounds to the nearest minute by default", () => {
    expect(formatLot(lot, false)).toBe("12°35′");
    expect(formatLot({ longitude: 30 + 12 + 34 / 60 + 29 / 3600, sign: "taurus" }, false)).toBe(
      "12°34′",
    );
  });

  it("rounds to the nearest second when seconds are shown", () => {
    expect(formatLot(lot, true)).toBe("12°34′31″");
    expect(formatLot({ longitude: 30 + 12 + 34 / 60 + 31.6 / 3600, sign: "taurus" }, true)).toBe(
      "12°34′32″",
    );
  });

  it("never rounds up into the next sign", () => {
    const last = { longitude: 59.9999, sign: "taurus" as const };
    expect(formatLot(last, false)).toBe("29°59′");
    expect(formatLot(last, true)).toBe("29°59′59″");
    expect(lotReading({ longitude: 0, sign: "aries" }, true)).toEqual({
      degree: 0,
      minute: 0,
      second: 0,
    });
  });
});
