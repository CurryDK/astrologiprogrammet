// Types mirroring what the Rust core returns, and Danish display names.

export type Sign =
  | "aries"
  | "taurus"
  | "gemini"
  | "cancer"
  | "leo"
  | "virgo"
  | "libra"
  | "scorpio"
  | "sagittarius"
  | "capricorn"
  | "aquarius"
  | "pisces";

export const SIGNS: Sign[] = [
  "aries",
  "taurus",
  "gemini",
  "cancer",
  "leo",
  "virgo",
  "libra",
  "scorpio",
  "sagittarius",
  "capricorn",
  "aquarius",
  "pisces",
];

export type Body =
  | "sun"
  | "moon"
  | "mercury"
  | "venus"
  | "mars"
  | "jupiter"
  | "saturn"
  | "uranus"
  | "neptune"
  | "pluto"
  | "northNode"
  | "southNode";

/** Display and aspect-grouping order (specification §5). */
export const BODIES: Body[] = [
  "sun",
  "moon",
  "mercury",
  "venus",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "pluto",
  "northNode",
  "southNode",
];

export type AngleId = "ascendant" | "midheaven";
export type PointId = Body | AngleId;

export type AspectKind = "conjunction" | "sextile" | "square" | "trine" | "opposition";

export const ASPECT_KINDS: AspectKind[] = [
  "conjunction",
  "sextile",
  "square",
  "trine",
  "opposition",
];

export type ZodiacPoint = {
  longitude: number;
  sign: Sign;
  degree: number;
  minute: number;
};

export type BodyPosition = ZodiacPoint & {
  body: Body;
  latitude: number;
  speed: number;
  retrograde: boolean;
  house: number;
};

export type Angle = ZodiacPoint & { house: number };

export type Chart = {
  utc: string;
  julianDay: number;
  latitude: number;
  longitude: number;
  positions: BodyPosition[];
  angles: {
    ascendant: Angle;
    descendant: Angle;
    midheaven: Angle;
    imumCoeli: Angle;
  };
  houses: { number: number; sign: Sign; ruler: Body }[];
  sect: "day" | "night";
};

export type Aspect = {
  a: PointId;
  b: PointId;
  kind: AspectKind;
  /** Absolute distance from exactness, in degrees. */
  orb: number;
  applying: boolean;
  outOfSign: boolean;
};

export type ResolvedTime = {
  utc: string;
  offsetSeconds: number;
  timeAssumed: boolean;
  ambiguous: boolean;
};

export type ComputedChart = {
  chart: Chart;
  aspects: Aspect[];
  time: ResolvedTime | null;
};

export type Orbs = Record<AspectKind, number>;

export type BirthInput = {
  date: string;
  time: string | null;
  latitude: number;
  longitude: number;
  zone: string | null;
  offsetSeconds: number | null;
};

export type ChartRecord = {
  id: number | null;
  name: string;
  folderId: number | null;
  birthDate: string;
  birthTime: string | null;
  placeName: string;
  countryCode: string | null;
  latitude: number;
  longitude: number;
  zone: string | null;
  offsetSeconds: number | null;
  featured: boolean;
};

export type Folder = { id: number; name: string };

export type Place = {
  name: string;
  countryCode: string;
  region: string;
  latitude: number;
  longitude: number;
  zone: string;
  population: number;
};

export function birthInputOf(record: ChartRecord): BirthInput {
  return {
    date: record.birthDate,
    time: record.birthTime,
    latitude: record.latitude,
    longitude: record.longitude,
    zone: record.zone,
    offsetSeconds: record.offsetSeconds,
  };
}

export const SIGN_NAMES: Record<Sign, string> = {
  aries: "Vædderen",
  taurus: "Tyren",
  gemini: "Tvillingerne",
  cancer: "Krebsen",
  leo: "Løven",
  virgo: "Jomfruen",
  libra: "Vægten",
  scorpio: "Skorpionen",
  sagittarius: "Skytten",
  capricorn: "Stenbukken",
  aquarius: "Vandbæreren",
  pisces: "Fiskene",
};

// The trailing U+FE0E asks for the text form of the glyph, not the emoji.
export const SIGN_GLYPHS: Record<Sign, string> = {
  aries: "♈︎",
  taurus: "♉︎",
  gemini: "♊︎",
  cancer: "♋︎",
  leo: "♌︎",
  virgo: "♍︎",
  libra: "♎︎",
  scorpio: "♏︎",
  sagittarius: "♐︎",
  capricorn: "♑︎",
  aquarius: "♒︎",
  pisces: "♓︎",
};

export const POINT_NAMES: Record<PointId, string> = {
  sun: "Solen",
  moon: "Månen",
  mercury: "Merkur",
  venus: "Venus",
  mars: "Mars",
  jupiter: "Jupiter",
  saturn: "Saturn",
  uranus: "Uranus",
  neptune: "Neptun",
  pluto: "Pluto",
  northNode: "Nordlige måneknude",
  southNode: "Sydlige måneknude",
  ascendant: "Ascendant",
  midheaven: "Medium Coeli",
};

export const POINT_GLYPHS: Record<PointId, string> = {
  sun: "☉",
  moon: "☽",
  mercury: "☿",
  venus: "♀︎",
  mars: "♂︎",
  jupiter: "♃",
  saturn: "♄",
  uranus: "♅",
  neptune: "♆",
  pluto: "♇",
  northNode: "☊",
  southNode: "☋",
  ascendant: "ASC",
  midheaven: "MC",
};

export const ASPECT_NAMES: Record<AspectKind, string> = {
  conjunction: "Konjunktion",
  sextile: "Sekstil",
  square: "Kvadrat",
  trine: "Trigon",
  opposition: "Opposition",
};

export const ASPECT_GLYPHS: Record<AspectKind, string> = {
  conjunction: "☌",
  sextile: "⚹",
  square: "□",
  trine: "△",
  opposition: "☍",
};

export function isBody(point: PointId): point is Body {
  return point !== "ascendant" && point !== "midheaven";
}

/** "10°22′" with a zero-padded minute. */
export function formatDegree(point: { degree: number; minute: number }): string {
  return `${point.degree}°${String(point.minute).padStart(2, "0")}′`;
}

/** An orb in degrees as "2°13′", truncated to whole minutes. */
export function formatOrb(orb: number): string {
  const totalMinutes = Math.floor(orb * 60 + 1e-9);
  return formatDegree({ degree: Math.floor(totalMinutes / 60), minute: totalMinutes % 60 });
}

/** A UTC offset in seconds as "+01:00" (or "+00:50:20" for local mean time). */
export function formatOffset(seconds: number): string {
  const sign = seconds < 0 ? "−" : "+";
  const abs = Math.abs(seconds);
  const pad = (n: number) => String(n).padStart(2, "0");
  const base = `${sign}${pad(Math.floor(abs / 3600))}:${pad(Math.floor((abs % 3600) / 60))}`;
  return abs % 60 === 0 ? base : `${base}:${pad(abs % 60)}`;
}

/** Parses "+1", "+01:00", "-5:30" or "1.5" into seconds; null when invalid. */
export function parseOffset(text: string): number | null {
  const cleaned = text.trim().replace("−", "-").replace(",", ".");
  const match = /^([+-])?(\d{1,2})(?::(\d{2})(?::(\d{2}))?|\.(\d+))?$/.exec(cleaned);
  if (!match) return null;
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2]);
  let seconds = hours * 3600;
  if (match[3]) seconds += Number(match[3]) * 60 + Number(match[4] ?? 0);
  if (match[5]) seconds += Math.round(Number(`0.${match[5]}`) * 3600);
  if (Number(match[3] ?? 0) > 59 || Number(match[4] ?? 0) > 59) return null;
  if (seconds > 16 * 3600) return null;
  return sign * seconds;
}

const regionNames = new Intl.DisplayNames(["da"], { type: "region" });

/** Danish country name for an ISO code, or the code itself if unknown. */
export function countryName(code: string | null): string {
  if (!code) return "";
  try {
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

const dateFormat = new Intl.DateTimeFormat("da-DK", { dateStyle: "long", timeZone: "UTC" });

/** "15. juni 1950" from "1950-06-15". */
export function formatBirthDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? isoDate : dateFormat.format(date);
}
