// User-adjustable settings. Everything here is remembered between sessions
// (specification §4, §5): colours, orbs and what is shown.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { api } from "./api";
import { ASPECT_KINDS, BODIES, type AspectKind, type Body, type Orbs } from "./astro";

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
    // Sextile pink, trine green, square red, opposition strong orange
    // (specification §4). The conjunction colour is used in the overview only.
    aspects: {
      conjunction: "#444444",
      sextile: "#f06aa8",
      square: "#d32f2f",
      trine: "#2e9e4f",
      opposition: "#ff7a00",
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
};

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
        setSettings(mergeOver(DEFAULT_SETTINGS, parsed));
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
