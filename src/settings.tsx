// User-adjustable settings. Everything here is remembered between sessions
// (specification §4, §5): colours, orbs and what is shown.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { api } from "./api";
import {
  ASPECT_KINDS,
  BODIES,
  CONDITION_GROUPS,
  LOTS,
  POINTS,
  STEP_UNITS,
  type AngleMethod,
  type AspectKind,
  type Body,
  type ConditionGroup,
  type Element,
  type LeapDayBirthday,
  type Lot,
  type Orbs,
  type PointId,
  type Rating,
  type StepUnit,
  type YearStart,
} from "./astro";

export type Settings = {
  orbs: Orbs;
  colors: {
    bodies: Record<Body, string>;
    aspects: Record<AspectKind, string>;
    /** Background of the sign fields in the zodiac ring, by element. */
    elements: Record<Element, string>;
  };
  /** The wheel itself (visual wheel specification of 15 November 2026). */
  wheel: {
    /** The information rings between the zodiac ring and the degree scale. */
    rings: { chaldeanDecans: boolean; modernDecans: boolean; bounds: boolean };
    /** Rulers of Scorpio, Aquarius and Pisces in the modern decans. */
    modernDecanRulers: ModernDecanRulers;
  };
  /** Which bodies are drawn in the wheel. */
  showInWheel: Record<Body, boolean>;
  /** Which bodies take part in aspects (wheel lines and overview). */
  inAspects: Record<Body, boolean>;
  /** Aspects to the angles, switched separately per view. */
  angleAspects: {
    wheel: { ascendant: boolean; midheaven: boolean };
    table: { ascendant: boolean; midheaven: boolean };
  };
  /** The seven Hermetic lots (specification §10). */
  lots: {
    /** Maximum orb of lot aspects, in degrees. */
    orb: number;
    /** A lot aspect is marked "e" when its orb is below this, in degrees. */
    exactOrb: number;
    /** Show lot positions with seconds instead of rounded to the minute. */
    showSeconds: boolean;
    /** Which lots are drawn in the wheel. */
    showInWheel: Record<Lot, boolean>;
    /** What the lot aspect overview compares the lots with. */
    aspectsTo: { planets: boolean; angles: boolean; lots: boolean };
  };
  /** Profections (specification §7). */
  profections: {
    /** The moment a profection year begins. */
    yearStart: YearStart;
    /** Birthday of a 29 February birth in years without that date. */
    leapDay: LeapDayBirthday;
    /** Show clock times with the dates of the profection months. */
    showTimes: boolean;
  };
  /** Transits and Live Chart (specification §8, §9). */
  transits: {
    /** Maximum orb of transit aspects, in degrees. */
    orb: number;
    /** Which transiting bodies are drawn in the wheel; separate from the natal choice. */
    showInWheel: Record<Body, boolean>;
    /** Which transiting bodies take part in transit aspects. */
    inAspects: Record<Body, boolean>;
    /** The aspect groups shown in Live Chart, each switched on its own. */
    groups: { natal: boolean; toNatal: boolean; toTransit: boolean };
    /** Combinable filters: with any on, only aspects involving their planets are shown. */
    filters: { yearLord: boolean; monthLord: boolean; profectionSign: boolean };
    /** The step of the time navigation arrows. */
    stepUnit: StepUnit;
    /** Whether the transit layer is shown in Live Chart at all. */
    show: boolean;
  };
  /** Secondary progressions (decision supplement of 15 November 2026). */
  progressions: {
    /** Whether the progression layer is shown in Live Chart at all. */
    show: boolean;
    /** Maximum orb of progression aspects, in degrees. */
    orb: number;
    /** How the progressed Ascendant and Midheaven are moved forward. */
    angleMethod: AngleMethod;
    /** Which progressed bodies and angles are drawn in the wheel. */
    showInWheel: Record<PointId, boolean>;
    /** Which progressed bodies and angles take part in progression aspects. */
    inAspects: Record<PointId, boolean>;
    /** The aspect groups shown, each switched on its own. */
    groups: { toNatal: boolean; toProgressed: boolean };
  };
  /** Where aspect lines between the layers of a Live Chart are drawn. */
  layerLines: LayerLines;
  /** Planetary Condition (specification §6). */
  condition: {
    /** Greatest distance from the Sun, in degrees, for each state; inclusive. */
    cazimi: number;
    combust: number;
    beams: number;
    /** Colour of each of the four evaluation categories. */
    colors: Record<Rating, string>;
    /** Which analysis categories are shown. */
    groups: Record<ConditionGroup, boolean>;
    /** Whether Chart Analysis also lists the facts that carry no rating. */
    analysisNeutral: boolean;
  };
};

export type ModernDecanRulers = "modern" | "traditional";
const MODERN_DECAN_RULERS: ModernDecanRulers[] = ["modern", "traditional"];

export type LayerLines = "center" | "rings";
const LAYER_LINES: LayerLines[] = ["center", "rings"];
const ANGLE_METHODS: AngleMethod[] = ["naibodRightAscension", "naibodLongitude"];

const everyPoint = <T,>(value: (point: PointId) => T) =>
  Object.fromEntries(POINTS.map((point) => [point, value(point)])) as Record<PointId, T>;

const everyBody = <T,>(value: (body: Body) => T) =>
  Object.fromEntries(BODIES.map((body) => [body, value(body)])) as Record<Body, T>;

export const DEFAULT_SETTINGS: Settings = {
  // 7° for every aspect type (specification §5).
  orbs: Object.fromEntries(ASPECT_KINDS.map((kind) => [kind, 7])) as Orbs,
  colors: {
    bodies: {
      sun: "#d98a00",
      moon: "#5b6b7a",
      mercury: "#7a5fb0",
      venus: "#2e9e6a",
      mars: "#cc3b2f",
      jupiter: "#2f6fcf",
      saturn: "#6b5a45",
      uranus: "#1aa3a3",
      neptune: "#4a5fd0",
      pluto: "#7a2f4f",
      northNode: "#555555",
      southNode: "#555555",
    },
    // Decision supplement of 14 November 2026, point 1. The conjunction
    // colour is used in the overview only; conjunctions get no line.
    aspects: {
      conjunction: "#444444",
      sextile: "#ff1493",
      square: "#e60000",
      trine: "#00a000",
      opposition: "#ff8c00",
    },
    // The specification fixes the hues (pale orange, green, yellow, blue)
    // and leaves the exact codes open. Proposed defaults, each adjustable.
    elements: {
      fire: "#fbdcc0",
      earth: "#d5e8c8",
      air: "#fbf2bd",
      water: "#cfe3f5",
    },
  },
  wheel: {
    // Decided: Chaldean decans and Egyptian bounds on, modern decans off.
    rings: { chaldeanDecans: true, modernDecans: false, bounds: true },
    // The specification does not say which rulers the modern decans use.
    // Proposed default: Pluto, Uranus and Neptune for Scorpio, Aquarius
    // and Pisces; the traditional rulers can be chosen instead.
    modernDecanRulers: "modern",
  },
  // The south node is always exactly opposite the north node, so it is off
  // until switched on.
  showInWheel: everyBody((body) => body !== "southNode"),
  inAspects: everyBody((body) => body !== "southNode"),
  angleAspects: {
    wheel: { ascendant: false, midheaven: false },
    table: { ascendant: true, midheaven: true },
  },
  lots: {
    // 3° is the specification's default (§10).
    orb: 3,
    // The specification does not define "exact". Proposed default: an orb
    // below 1°, i.e. one that reads 0°xx′. Adjustable in the settings.
    exactOrb: 1,
    // Degrees and minutes by default; seconds are optional.
    showSeconds: false,
    // Decided: every lot is hidden in the wheel until switched on.
    showInWheel: Object.fromEntries(LOTS.map((lot) => [lot, false])) as Record<Lot, boolean>,
    // The specification does not say what lots are compared with. Proposed
    // default: the planets only; angles and other lots can be switched on.
    aspectsTo: { planets: true, angles: false, lots: false },
  },
  profections: {
    // The specification says "birthday" without defining the moment.
    // Proposed default: the calendar birthday at the clock time of birth,
    // in the birthplace's time zone.
    yearStart: "birthClockTime",
    // Not stated in the specification. Proposed default: 28 February.
    leapDay: "february28",
    // The 12 equal months change at odd clock times, so they are shown.
    showTimes: true,
  },
  transits: {
    // The specification gives no orb for transits. Proposed default: the
    // 7° it gives for aspects in general. Adjustable in the settings.
    orb: 7,
    showInWheel: everyBody((body) => body !== "southNode"),
    inAspects: everyBody((body) => body !== "southNode"),
    groups: { natal: false, toNatal: true, toTransit: false },
    filters: { yearLord: false, monthLord: false, profectionSign: false },
    stepUnit: "day",
    show: true,
  },
  progressions: {
    show: true,
    // Decided: 1° for progression → natal and progression → progression.
    orb: 1,
    // Decided: Naibod in right ascension; in ecliptic longitude selectable.
    angleMethod: "naibodRightAscension",
    showInWheel: everyPoint((point) => point !== "southNode"),
    inAspects: everyPoint((point) => point !== "southNode"),
    groups: { toNatal: true, toProgressed: false },
  },
  // Decision 9 says lines go "directly from planet to planet". Two readings
  // are offered: between the exact degrees on the inner circle, as natal and
  // transit lines have been drawn so far (default), or from each layer's
  // own ring.
  layerLines: "center",
  condition: {
    // Decided 14 November 2026: cazimi within 1°, combust to 8°, under
    // the beams to 15°, each adjustable.
    cazimi: 1,
    combust: 8,
    beams: 15,
    // Decided: turquoise for supportive, red for challenging; the "very"
    // categories are drawn filled, the others as an outline. Turquoise was
    // confirmed on 15 November 2026 over the green of a later legend.
    colors: {
      verySupportive: "#0e9aa7",
      supportive: "#0e9aa7",
      challenging: "#d32f2f",
      veryChallenging: "#d32f2f",
    },
    groups: Object.fromEntries(CONDITION_GROUPS.map((group) => [group, true])) as Record<
      ConditionGroup,
      boolean
    >,
    // Chart Analysis reuses the five categories, the neutral facts
    // included (specification of 15 November 2026, section 6). They make
    // the lists long, so they can be hidden. Proposed default: shown.
    analysisNeutral: true,
  },
};

const YEAR_STARTS: YearStart[] = ["birthClockTime", "midnight", "solarReturn"];
const LEAP_DAYS: LeapDayBirthday[] = ["february28", "march1"];

const STORAGE_KEY = "settings";

/** Stored values win; anything missing (e.g. added in a later version) falls back to the default. */
export function mergeOver<T>(defaults: T, stored: unknown): T {
  if (typeof defaults !== "object" || defaults === null) {
    return typeof stored === typeof defaults ? (stored as T) : defaults;
  }
  if (typeof stored !== "object" || stored === null) return defaults;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(defaults as object)) {
    result[key] = mergeOver(
      (defaults as Record<string, unknown>)[key],
      (stored as Record<string, unknown>)[key],
    );
  }
  return result as T;
}

/**
 * Aspect colours that were the defaults up to version 0.2.1. Settings are
 * saved as a whole, so a user who changed anything has these stored even
 * though they never chose them.
 */
const ASPECT_COLORS_BEFORE_0_2_2: Partial<Record<AspectKind, string>> = {
  sextile: "#f06aa8",
  square: "#d32f2f",
  trine: "#2e9e4f",
  opposition: "#ff7a00",
};

/**
 * Stored settings merged over the defaults. An aspect colour that still has
 * its old default value follows the new default; one the user picked is kept.
 */
export function settingsFromStored(stored: unknown): Settings {
  const settings = mergeOver(DEFAULT_SETTINGS, stored);
  const aspects = { ...settings.colors.aspects };
  for (const kind of ASPECT_KINDS) {
    if (aspects[kind].toLowerCase() === ASPECT_COLORS_BEFORE_0_2_2[kind]) {
      aspects[kind] = DEFAULT_SETTINGS.colors.aspects[kind];
    }
  }
  // A stored choice this version does not know falls back to the default.
  const profections = { ...settings.profections };
  if (!YEAR_STARTS.includes(profections.yearStart)) {
    profections.yearStart = DEFAULT_SETTINGS.profections.yearStart;
  }
  if (!LEAP_DAYS.includes(profections.leapDay)) {
    profections.leapDay = DEFAULT_SETTINGS.profections.leapDay;
  }
  const transits = { ...settings.transits };
  if (!STEP_UNITS.includes(transits.stepUnit)) {
    transits.stepUnit = DEFAULT_SETTINGS.transits.stepUnit;
  }
  const progressions = { ...settings.progressions };
  if (!ANGLE_METHODS.includes(progressions.angleMethod)) {
    progressions.angleMethod = DEFAULT_SETTINGS.progressions.angleMethod;
  }
  const layerLines = LAYER_LINES.includes(settings.layerLines)
    ? settings.layerLines
    : DEFAULT_SETTINGS.layerLines;
  const wheel = { ...settings.wheel };
  if (!MODERN_DECAN_RULERS.includes(wheel.modernDecanRulers)) {
    wheel.modernDecanRulers = DEFAULT_SETTINGS.wheel.modernDecanRulers;
  }
  return { ...settings, colors: { ...settings.colors, aspects }, profections,
    transits,
    progressions,
    layerLines,
    wheel,
  };
}

type SettingsContextValue = {
  settings: Settings;
  /** Apply a change and remember it. */
  update: (change: (current: Settings) => Settings) => void;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    api
      .settingGet(STORAGE_KEY)
      .then((stored) => {
        let parsed: unknown = null;
        try {
          parsed = stored ? JSON.parse(stored) : null;
        } catch {
          // Unreadable settings fall back to defaults rather than blocking the app.
        }
        setSettings(settingsFromStored(parsed));
      })
      .catch((error) => {
        console.error(error);
        setSettings(DEFAULT_SETTINGS);
      });
  }, []);

  const update = useCallback((change: (current: Settings) => Settings) => {
    setSettings((current) => {
      if (!current) return current;
      const next = change(current);
      // Colour pickers fire many changes per second; save once they settle.
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        api.settingSet(STORAGE_KEY, JSON.stringify(next)).catch(console.error);
      }, 300);
      return next;
    });
  }, []);

  if (!settings) return null;
  return (
    <SettingsContext.Provider value={{ settings, update }}>{children}</SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (!value) throw new Error("useSettings must be used inside SettingsProvider");
  return value;
}
