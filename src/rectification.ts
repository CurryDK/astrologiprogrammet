// Rectification (decisions 11–15 of 15 November 2026): the birth time is
// moved in steps of minutes while everything else stands still. Only clock
// arithmetic lives here; every chart is recalculated by the backend.

/** A birth date and clock time as entered: `YYYY-MM-DD` and `HH:MM`. */
export type BirthClock = { date: string; time: string };

const pad = (value: number) => String(value).padStart(2, "0");

/**
 * The clock reading `minutes` later (earlier when negative). Passing
 * midnight changes the date: these are readings of the birthplace's clock,
 * not moments, so no time zone is involved.
 */
export function shiftClock(clock: BirthClock, minutes: number): BirthClock {
  const [year, month, day] = clock.date.split("-").map(Number);
  const [hour, minute] = clock.time.split(":").map(Number);
  const date = new Date(0);
  // setUTCFullYear keeps years below 100 as they are.
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute + minutes, 0, 0);
  return {
    date: `${String(date.getUTCFullYear()).padStart(4, "0")}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`,
    time: `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`,
  };
}

/** Minutes from one clock reading to another. */
export function minutesBetween(from: BirthClock, to: BirthClock): number {
  const stamp = (clock: BirthClock) => Date.parse(`${clock.date}T${clock.time}:00Z`);
  return Math.round((stamp(to) - stamp(from)) / 60_000);
}

/** "+12 min", "−1 t 5 min", "uændret". */
export function formatShift(minutes: number): string {
  if (minutes === 0) return "uændret";
  const size = Math.abs(minutes);
  const hours = Math.floor(size / 60);
  const rest = size % 60;
  const parts = [hours ? `${hours} t` : "", rest ? `${rest} min` : ""].filter(Boolean);
  return `${minutes > 0 ? "+" : "−"}${parts.join(" ")}`;
}
