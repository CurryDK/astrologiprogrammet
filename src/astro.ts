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

/** The seven Hermetic lots (specification §10), in calculation order. */
export type Lot = "fortune" | "spirit" | "eros" | "necessity" | "courage" | "victory" | "nemesis";

export const LOTS: Lot[] = [
  "fortune",
  "spirit",
  "eros",
  "necessity",
  "courage",
  "victory",
  "nemesis",
];

export type Sect = "day" | "night";

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
  /** Derived from the Sun; a manual choice is in `LotReport.sect`. */
  sect: Sect;
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

export type LotPosition = ZodiacPoint & {
  lot: Lot;
  house: number;
  /** The lot's traditional planet. */
  planet: Body;
  /** Traditional ruler of the lot's sign, with that ruler's sign and house. */
  ruler: Body;
  rulerSign: Sign;
  rulerHouse: number;
};

export type LotAspect = {
  lot: Lot;
  other: PointId | Lot;
  kind: AspectKind;
  orb: number;
  /** Orb below the exactness limit ("e"). */
  exact: boolean;
  outOfSign: boolean;
};

export type LotReport = {
  /** The sect whose formulas were used. */
  sect: Sect;
  /** True when the user chose the sect instead of the Sun deciding it. */
  overridden: boolean;
  positions: LotPosition[];
  aspects: LotAspect[];
};

export type LotOptions = {
  sectOverride: Sect | null;
  orb: number;
  exactOrb: number;
};

export type ComputedChart = {
  chart: Chart;
  aspects: Aspect[];
  time: ResolvedTime | null;
  /** Natal charts only; null for "the sky now". */
  lots: LotReport | null;
};

/** The seven traditional planets Planetary Condition covers, in display order. */
export const PLANETS: Body[] = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn"];

export type Rating = "verySupportive" | "supportive" | "challenging" | "veryChallenging";

export const RATINGS: Rating[] = ["verySupportive", "supportive", "challenging", "veryChallenging"];

/** The analysis categories of Planetary Condition; each can be switched off. */
export type ConditionGroup =
  | "sect"
  | "joys"
  | "dignities"
  | "sun"
  | "houses"
  | "copresence"
  | "domicileLord"
  | "reception"
  | "overcoming"
  | "bonification"
  | "maltreatment";

export const CONDITION_GROUPS: ConditionGroup[] = [
  "sect",
  "joys",
  "dignities",
  "sun",
  "houses",
  "copresence",
  "domicileLord",
  "reception",
  "overcoming",
  "bonification",
  "maltreatment",
];

export type ConditionKind =
  | "sectLight"
  | "sectFavored"
  | "sectContrary"
  | "joyHemisphere"
  | "joySignPolarity"
  | "joySolarPhase"
  | "joyHouse"
  | "domicile"
  | "exaltation"
  | "triplicity"
  | "bounds"
  | "decan"
  | "detriment"
  | "fall"
  | "cazimi"
  | "combust"
  | "underBeams"
  | "chariot"
  | "houseAngular"
  | "houseFortunate"
  | "houseUnfortunate"
  | "nearAngle"
  | "copresence"
  | "lordWitness"
  | "lordCopresent"
  | "lordAversion"
  | "reception"
  | "mutualReception"
  | "overcomes"
  | "overcomeBy"
  | "byOvercoming"
  | "superiorSextile"
  | "signTrine"
  | "signOpposition"
  | "engagement"
  | "adherence"
  | "strikingRay"
  | "enclosure"
  | "enclosureBroken";

export type Dignity = "domicile" | "exaltation" | "triplicity" | "bounds" | "decan";

export type AngleName = "ascendant" | "descendant" | "midheaven" | "imumCoeli";

/** One condition of one planet. Fields that do not apply are null or empty. */
export type Condition = {
  kind: ConditionKind;
  group: ConditionGroup;
  /** Null for a fact that carries no evaluation. */
  rating: Rating | null;
  /** The other planets involved. */
  others: Body[];
  aspect: AspectKind | null;
  /** Degrees: from exact aspect, from the Sun, or from an angle. */
  orb: number | null;
  /** True applying or exact, false separating, null when not relevant or undetermined. */
  applying: boolean | null;
  sectRole: "leader" | "benefic" | "malefic" | null;
  /** Co-presence: whether the benefic or malefic belongs to the sect in favour. */
  favored: boolean | null;
  triplicityRole: "day" | "night" | "participating" | null;
  angle: AngleName | null;
  dignities: Dignity[];
  returnDignities: Dignity[];
  /** Enclosure: by bodies (true) or by rays (false). */
  bodily: boolean | null;
  /** Planets whose body (aspect null) or ray breaks an enclosure. */
  breakers: { body: Body; aspect: AspectKind | null }[];
  /** Combust or under the beams whose negative rating the chariot removes. */
  suppressed: boolean;
};

export type SolarPhase = "morning" | "evening" | "undetermined";

export type PlanetCondition = {
  body: Body;
  sign: Sign;
  house: number;
  houseType: "angular" | "succedent" | "cadent";
  /** Null for Mercury exactly conjunct the Sun. */
  sect: "diurnal" | "nocturnal" | null;
  aboveHorizon: boolean;
  /** Null for the Sun and the Moon. */
  phase: SolarPhase | null;
  /** Degrees from the Sun; null for the Sun. */
  sunDistance: number | null;
  /** Degrees per day; negative when retrograde. */
  speed: number;
  retrograde: boolean;
  /** Retro when retrograde; otherwise Slow or Fast against the planet's mean daily motion. */
  speedStatus: "retro" | "slow" | "fast" | null;
  lords: {
    domicile: Body;
    exaltation: Body | null;
    /** Day, night and participating lord. */
    triplicity: Body[];
    bounds: Body;
    decan: Body;
  };
  conditions: Condition[];
};

export type StationMoment = { at: Moment; turns: "retrograde" | "direct" };

export type PlanetStations = {
  body: Body;
  previous: StationMoment | null;
  next: StationMoment | null;
};

export type ConditionReport = {
  /** The sect used; may be the manual choice. */
  sect: Sect;
  overridden: boolean;
  sectLight: Body;
  planets: PlanetCondition[];
  /** Last and next station of Mercury to Saturn around the birth. */
  stations: PlanetStations[];
};

/** The adjustable distances from the Sun, in degrees. */
export type ConditionOptions = { cazimi: number; combust: number; beams: number };

/** The moment a profection year begins (the specification only says "birthday"). */
export type YearStart = "birthClockTime" | "midnight" | "solarReturn";

/** The birthday of a 29 February birth in years without that date. */
export type LeapDayBirthday = "february28" | "march1";

export type ProfectionOptions = { yearStart: YearStart; leapDay: LeapDayBirthday };

/** An instant with the clock reading at the birthplace. */
export type Moment = {
  utc: string;
  /** `YYYY-MM-DDTHH:MM:SS`, possibly with a fraction, in the birthplace's time zone. */
  local: string;
  offsetSeconds: number;
};

export type ProfectionMonth = {
  /** 1–12 within the profection year. */
  number: number;
  start: Moment;
  end: Moment;
  house: number;
  sign: Sign;
  ruler: Body;
};

export type ProfectionYear = {
  age: number;
  start: Moment;
  end: Moment;
  house: number;
  sign: Sign;
  timeLord: Body;
  months: ProfectionMonth[];
};

export type ProfectionReport = {
  year: ProfectionYear;
  /** Age now; null when now is before the birth. */
  currentAge: number | null;
  /** Month (1–12) of this year that holds now, when now is in this year. */
  currentMonth: number | null;
  timeAssumed: boolean;
};

/** The steps of manual time navigation (specification §8). */
export type StepUnit = "minute" | "hour" | "day" | "week" | "month";

export const STEP_UNITS: StepUnit[] = ["minute", "hour", "day", "week", "month"];

export const STEP_NAMES: Record<StepUnit, string> = {
  minute: "1 minut",
  hour: "1 time",
  day: "1 dag",
  week: "1 uge",
  month: "1 måned",
};

export type TimeStep = { unit: StepUnit; count: number };

/** An aspect from a transiting body to a natal body or angle. */
export type TransitAspect = {
  transit: Body;
  natal: PointId;
  kind: AspectKind;
  orb: number;
  applying: boolean;
  outOfSign: boolean;
};

/** The transit layer of a Live Chart at one moment. */
export type LiveChart = {
  at: Moment;
  /** Transiting bodies; `house` is the natal whole-sign house. */
  positions: BodyPosition[];
  toNatal: TransitAspect[];
  toTransit: Aspect[];
  age: number | null;
  profection: ProfectionYear | null;
  profectionMonth: number | null;
};

export type SkyAt = { at: Moment; computed: ComputedChart };

/** What a transit aspect is made to: a natal point or another transiting body. */
export type PassOther = { natal: PointId } | { transit: Body };

/**
 * A life event of a natal chart. Only what is known is stored: a missing
 * month, day or clock time is null, never a made-up value.
 */
export type LifeEvent = {
  id: number | null;
  chartId: number;
  title: string;
  year: number;
  month: number | null;
  day: number | null;
  /** `HH:MM`, or null when unknown. */
  time: string | null;
  /** IANA time zone the date and time are given in. */
  zone: string | null;
  note: string;
};

export type EventPrecision = "datetime" | "date" | "month" | "year";

export function eventPrecision(event: Pick<LifeEvent, "month" | "day" | "time">): EventPrecision {
  if (event.month === null) return "year";
  if (event.day === null) return "month";
  return event.time === null ? "date" : "datetime";
}

/** `YYYY-MM-DD` when the event has a full date, otherwise null. */
export function eventDate(event: Pick<LifeEvent, "year" | "month" | "day">): string | null {
  if (event.month === null || event.day === null) return null;
  const pad = (n: number, width: number) => String(n).padStart(width, "0");
  return `${pad(event.year, 4)}-${pad(event.month, 2)}-${pad(event.day, 2)}`;
}

const monthYearFormat = new Intl.DateTimeFormat("da-DK", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * When an event happened, as precisely as it is known, with the missing
 * part spelled out so it is never mistaken for a known value.
 */
export function formatEventWhen(event: Pick<LifeEvent, "year" | "month" | "day" | "time">): string {
  const date = eventDate(event);
  if (date !== null) {
    return event.time !== null
      ? `${formatBirthDate(date)} kl. ${event.time}`
      : `${formatBirthDate(date)} · klokkeslæt ukendt`;
  }
  if (event.month !== null) {
    const month = monthYearFormat.format(new Date(Date.UTC(event.year, event.month - 1, 1)));
    return `${month} · kun måned og år kendt`;
  }
  return `${event.year} · kun årstal kendt`;
}

/** The computer's time zone, e.g. "Europe/Copenhagen". */
export function localZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

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
  /** Manual day/night sect; null lets the Sun decide. */
  sectOverride: Sect | null;
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

// The specification keeps the English names of the lots.
export const LOT_NAMES: Record<Lot, string> = {
  fortune: "Fortune",
  spirit: "Spirit",
  eros: "Eros",
  necessity: "Necessity",
  courage: "Courage",
  victory: "Victory",
  nemesis: "Nemesis",
};

/**
 * PLACEHOLDERS. The specification says the lot symbols are not chosen yet,
 * so each lot is shown as two letters in a circle until they are.
 */
/**
 * The planet whose glyph stands inside a lot's circle. Fortune and Spirit
 * have their own traditional symbols instead (visual wheel specification of
 * 15 November 2026, section 5).
 */
export const LOT_SYMBOL_PLANETS: Record<Lot, Body | null> = {
  fortune: null,
  spirit: null,
  eros: "venus",
  necessity: "mercury",
  courage: "mars",
  victory: "jupiter",
  nemesis: "saturn",
};

export type Element = "fire" | "earth" | "air" | "water";

export const ELEMENTS: Element[] = ["fire", "earth", "air", "water"];

export const ELEMENT_NAMES: Record<Element, string> = {
  fire: "Ild",
  earth: "Jord",
  air: "Luft",
  water: "Vand",
};

/** The signs run fire, earth, air, water from Aries. */
export function elementOf(sign: Sign): Element {
  return ELEMENTS[SIGNS.indexOf(sign) % 4];
}

/** One segment of a ring around the wheel: [start, end) in degrees, and its lord. */
export type RingSegment = { start: number; end: number; lord: Body };

/** The decan and bounds rings; fixed tables from the calculation core. */
export type WheelRings = {
  chaldeanDecans: RingSegment[];
  /** Modern decans with Pluto, Uranus and Neptune as rulers. */
  modernDecans: RingSegment[];
  /** Modern decans with the traditional rulers only. */
  modernDecansTraditional: RingSegment[];
  bounds: RingSegment[];
};

export const SECT_NAMES: Record<Sect, string> = { day: "Dagkort", night: "Natkort" };

export function isLot(point: PointId | Lot): point is Lot {
  return (LOTS as string[]).includes(point);
}

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

/**
 * A lot's position within its sign for display, rounded to the nearest minute
 * or, with `seconds`, to the nearest second (decision supplement of
 * 14 November 2026, point 6). Only the display is rounded; the longitude is
 * untouched. A reading never rounds up into the next sign: it stops at
 * 29°59′ (or 29°59′59″), so the sign shown is always the sign the lot is in.
 */
export function lotReading(
  lot: { longitude: number; sign: Sign },
  seconds: boolean,
): { degree: number; minute: number; second: number } {
  const unitsPerDegree = seconds ? 3600 : 60;
  const withinSign = lot.longitude - SIGNS.indexOf(lot.sign) * 30;
  const units = Math.min(
    Math.max(Math.round(withinSign * unitsPerDegree), 0),
    30 * unitsPerDegree - 1,
  );
  const totalSeconds = seconds ? units : units * 60;
  return {
    degree: Math.floor(totalSeconds / 3600),
    minute: Math.floor(totalSeconds / 60) % 60,
    second: totalSeconds % 60,
  };
}

/** A lot's position as "10°22′", or "10°22′31″" with seconds. */
export function formatLot(lot: { longitude: number; sign: Sign }, seconds: boolean): string {
  const reading = lotReading(lot, seconds);
  const text = formatDegree(reading);
  return seconds ? `${text}${String(reading.second).padStart(2, "0")}″` : text;
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

const weekdayFormat = new Intl.DateTimeFormat("da-DK", { weekday: "long", timeZone: "UTC" });

/** "lørdag 14. november 2026 kl. 21:05" from a moment's local clock reading. */
export function formatMomentLong(moment: { local: string }): string {
  const day = moment.local.slice(0, 10);
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return moment.local;
  return `${weekdayFormat.format(date)} ${dateFormat.format(date)} kl. ${moment.local.slice(11, 16)}`;
}

const shortDateFormat = new Intl.DateTimeFormat("da-DK", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * A moment's clock reading at the birthplace as "4. feb. 2002", or with
 * `withTime` "4. feb. 2002 kl. 14:20". The time is cut to whole minutes,
 * never rounded up, so a period is not shown as started before it has.
 */
export function formatMoment(moment: { local: string }, withTime: boolean): string {
  const date = new Date(`${moment.local.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return moment.local;
  const day = shortDateFormat.format(date);
  return withTime ? `${day} kl. ${moment.local.slice(11, 16)}` : day;
}

/** "15. juni 1950" from "1950-06-15". */
export function formatBirthDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? isoDate : dateFormat.format(date);
}
