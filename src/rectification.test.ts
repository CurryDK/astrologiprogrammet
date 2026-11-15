import { describe, expect, it } from "vitest";
import { formatShift, minutesBetween, shiftClock } from "./rectification";

describe("shiftClock", () => {
  it("moves the clock by minutes and hours", () => {
    const clock = { date: "1962-02-04", time: "14:20" };
    expect(shiftClock(clock, 1)).toEqual({ date: "1962-02-04", time: "14:21" });
    expect(shiftClock(clock, -10)).toEqual({ date: "1962-02-04", time: "14:10" });
    expect(shiftClock(clock, 60)).toEqual({ date: "1962-02-04", time: "15:20" });
    expect(shiftClock(clock, -25)).toEqual({ date: "1962-02-04", time: "13:55" });
  });

  it("changes the date when passing midnight", () => {
    expect(shiftClock({ date: "1962-02-04", time: "23:55" }, 10)).toEqual({
      date: "1962-02-05",
      time: "00:05",
    });
    expect(shiftClock({ date: "1960-03-01", time: "00:30" }, -60)).toEqual({
      date: "1960-02-29",
      time: "23:30",
    });
    expect(shiftClock({ date: "1899-12-31", time: "23:59" }, 1)).toEqual({
      date: "1900-01-01",
      time: "00:00",
    });
  });
});

describe("minutesBetween and formatShift", () => {
  it("measure and describe the change", () => {
    const original = { date: "1962-02-04", time: "14:20" };
    expect(minutesBetween(original, original)).toBe(0);
    expect(minutesBetween(original, shiftClock(original, 72))).toBe(72);
    expect(minutesBetween(original, { date: "1962-02-03", time: "23:20" })).toBe(-900);
    expect(formatShift(0)).toBe("uændret");
    expect(formatShift(12)).toBe("+12 min");
    expect(formatShift(-65)).toBe("−1 t 5 min");
    expect(formatShift(120)).toBe("+2 t");
  });
});
