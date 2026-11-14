// User-adjustable settings. Everything here is remembered between sessions
// (specification §4, §5): colours, orbs and what is shown.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { api } from "./api";
import {
  ASPECT_KINDS,
  BODIES,
  LOTS,
  STEP_UNITS,
  type AspectKind,
  type Body,
  type LeapDayBirthday,
  type Lot,
  type Orbs,
  type StepUnit,
  type YearStart,
} from "./astro";

export type Settings = {
  orbs: Orbs;
  colors: {
    bodies: Record<Body, string>;
    aspects: Record<AspectKind, string>;
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
  };
};

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
    showInWheel: Object.fromEntries(LOTS.map((lot) => [lot, true])) as Record<Lot, boolean>,
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
  return { ...settings, colors: { ...settings.colors, aspects }, profections, transits };
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
