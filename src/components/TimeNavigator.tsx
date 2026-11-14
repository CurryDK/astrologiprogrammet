import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { STEP_NAMES, STEP_UNITS, formatMomentLong, formatOffset, type Moment, type StepUnit } from "../astro";

/** How long an arrow is held before it starts repeating, and how fast. */
const REPEAT_DELAY_MS = 450;
const REPEAT_EVERY_MS = 140;

type Props = {
  at: Moment;
  /** The time zone the moment is shown and entered in. */
  zone: string;
  unit: StepUnit;
  onUnit: (unit: StepUnit) => void;
  /** One step back (-1) or forward (1). */
  onStep: (direction: -1 | 1) => void;
  onNow: () => void;
  /** Jump to an exact UTC instant. */
  onGoTo: (utc: string) => void;
};

/**
 * Manual time navigation (specification §8): one click is one step, a held
 * arrow repeats, and an exact date and time can be entered. No autoplay.
 */
export function TimeNavigator({ at, zone, unit, onUnit, onStep, onNow, onGoTo }: Props) {
  const [date, setDate] = useState(at.local.slice(0, 10));
  const [time, setTime] = useState(at.local.slice(11, 16));
  const [error, setError] = useState<string | null>(null);
  const timers = useRef<{ delay?: number; repeat?: number }>({});
  const step = useRef(onStep);
  step.current = onStep;

  // The entry fields follow the shown moment.
  useEffect(() => {
    setDate(at.local.slice(0, 10));
    setTime(at.local.slice(11, 16));
    setError(null);
  }, [at.local]);

  const release = () => {
    window.clearTimeout(timers.current.delay);
    window.clearInterval(timers.current.repeat);
    timers.current = {};
  };
  useEffect(() => release, []);

  const hold = (direction: -1 | 1) => {
    release();
    step.current(direction);
    timers.current.delay = window.setTimeout(() => {
      timers.current.repeat = window.setInterval(() => step.current(direction), REPEAT_EVERY_MS);
    }, REPEAT_DELAY_MS);
  };

  const arrow = (direction: -1 | 1, label: string, text: string) => (
    <button
      className="step-arrow"
      aria-label={label}
      title={label}
      onPointerDown={(e) => {
        if (e.button === 0) hold(direction);
      }}
      onPointerUp={release}
      onPointerLeave={release}
      onPointerCancel={release}
      onBlur={release}
      // A click without a pointer is the keyboard (Enter or Space).
      onClick={(e) => {
        if (e.detail === 0) onStep(direction);
      }}
    >
      {text}
    </button>
  );

  async function goTo() {
    if (!date) {
      setError("Vælg en dato.");
      return;
    }
    try {
      const resolved = await api.localResolve(date, time || null, zone);
      setError(null);
      onGoTo(resolved.utc);
    } catch (reason) {
      setError(`Tidspunktet kan ikke bruges: ${String(reason)}`);
    }
  }

  return (
    <div className="time-navigator">
      <div className="time-now">
        <strong>{formatMomentLong(at)}</strong>
        <span className="muted">
          {zone} · UTC{formatOffset(at.offsetSeconds)}
        </span>
      </div>
      <div className="time-controls">
        {arrow(-1, `${STEP_NAMES[unit]} tilbage`, "‹")}
        <select
          aria-label="Trin"
          value={unit}
          onChange={(e) => onUnit(e.target.value as StepUnit)}
        >
          {STEP_UNITS.map((u) => (
            <option key={u} value={u}>
              {STEP_NAMES[u]}
            </option>
          ))}
        </select>
        {arrow(1, `${STEP_NAMES[unit]} frem`, "›")}
        <button onClick={onNow}>Nu</button>
        <span className="time-entry">
          <input
            type="date"
            aria-label="Dato"
            value={date}
            min="1800-01-01"
            max="2399-12-31"
            onChange={(e) => setDate(e.target.value)}
          />
          <input
            type="time"
            aria-label="Klokkeslæt"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
          <button onClick={goTo}>Gå til</button>
        </span>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
