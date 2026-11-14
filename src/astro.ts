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

export const BODY_NAMES: Record<Body, string> = {
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
};

export const BODY_GLYPHS: Record<Body, string> = {
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
};

/** "10°22′" with a zero-padded minute. */
export function formatDegree(point: ZodiacPoint): string {
  return `${point.degree}°${String(point.minute).padStart(2, "0")}′`;
}
