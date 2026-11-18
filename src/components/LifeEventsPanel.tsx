import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import {
  eventDate,
  eventPrecision,
  formatEventWhen,
  localZone,
  type ChartRecord,
  type EventPrecision,
  type LifeEvent,
} from "../astro";
import { Box } from "./PanelBoard";

type Props = {
  record: ChartRecord;
  /** Show the Live Chart at a UTC instant. */
  onJump: (utc: string) => void;
  /** Text of the jump button, e.g. "Vis i Live Chart" or "Gå til". */
  jumpLabel: string;
  /**
   * A moment to register as a new event ("Gem som livsbegivenhed" in Live
   * Chart): the form opens with it filled in, to be named and adjusted
   * before it is saved. A new `key` asks again.
   */
  prefill?: EventPrefill | null;
};

/** A date and clock time in a time zone, as Live Chart shows its moment. */
export type EventPrefill = { key: number; date: string; time: string; zone: string };

type Draft = {
  id: number | null;
  title: string;
  precision: EventPrecision;
  /** `YYYY-MM-DD`, used for the two precise kinds. */
  date: string;
  time: string;
  /** `YYYY-MM`, used when only month and year are known. */
  month: string;
  year: string;
  note: string;
  /** The time zone the date and time were read in, when it is not the computer's own. */
  zone?: string;
};

const PRECISION_NAMES: Record<EventPrecision, string> = {
  datetime: "Dato og klokkeslæt",
  date: "Dato, klokkeslæt ukendt",
  month: "Kun måned og år",
  year: "Kun årstal",
};

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

function draftOf(event: LifeEvent | null): Draft {
  if (!event) {
    return { id: null, title: "", precision: "date", date: "", time: "", month: "", year: "", note: "" };
  }
  return {
    id: event.id,
    title: event.title,
    precision: eventPrecision(event),
    date: eventDate(event) ?? "",
    time: event.time ?? "",
    month: event.month !== null ? `${pad(event.year, 4)}-${pad(event.month)}` : "",
    year: String(event.year),
    note: event.note,
  };
}

/** The event a draft describes, or a Danish message saying what is missing. */
function eventOf(draft: Draft, chartId: number, zone: string | null): LifeEvent | string {
  const base = { id: draft.id, chartId, title: draft.title.trim(), note: draft.note.trim() };
  if (!base.title) return "Skriv en titel.";
  switch (draft.precision) {
    case "datetime":
    case "date": {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(draft.date);
      if (!match) return "Vælg en dato.";
      const timed = draft.precision === "datetime";
      if (timed && !/^\d{2}:\d{2}$/.test(draft.time)) return "Angiv et klokkeslæt.";
      return {
        ...base,
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3]),
        time: timed ? draft.time : null,
        zone,
      };
    }
    case "month": {
      const match = /^(\d{4})-(\d{2})$/.exec(draft.month);
      if (!match) return "Vælg måned og år.";
      return { ...base, year: Number(match[1]), month: Number(match[2]), day: null, time: null, zone };
    }
    case "year": {
      if (!/^\d{4}$/.test(draft.year.trim())) return "Angiv et årstal med fire cifre.";
      return { ...base, year: Number(draft.year), month: null, day: null, time: null, zone };
    }
  }
}

/** First and last possible date of an event without a full date. */
function dateBounds(event: LifeEvent): { min: string; max: string } {
  const year = pad(event.year, 4);
  if (event.month === null) return { min: `${year}-01-01`, max: `${year}-12-31` };
  const lastDay = new Date(Date.UTC(event.year, event.month, 0)).getUTCDate();
  return { min: `${year}-${pad(event.month)}-01`, max: `${year}-${pad(event.month)}-${pad(lastDay)}` };
}

/**
 * The life events of a natal chart (specification §3; decision supplement of
 * 14 November 2026, point 4). An event keeps only what is known about its
 * date. One with a full date can be shown in Live Chart directly (at 12:00
 * when its clock time is unknown); one without must first be given a date
 * by the user, and that date is not stored with the event.
 */
export function LifeEventsPanel({ record, onJump, jumpLabel, prefill }: Props) {
  const chartId = record.id;
  const [events, setEvents] = useState<LifeEvent[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<number | null>(null);
  /** Dates picked for events without a full date, by event id. Not stored. */
  const [picked, setPicked] = useState<Record<number, string>>({});

  const reload = useCallback(async () => {
    if (chartId === null) return;
    try {
      setEvents(await api.eventsList(chartId));
    } catch (reason) {
      setError(String(reason));
    }
  }, [chartId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const form = useRef<HTMLDivElement>(null);
  const prefillKey = prefill?.key;
  useEffect(() => {
    if (!prefill) return;
    setDraft({ ...draftOf(null), precision: "datetime", date: prefill.date, time: prefill.time, zone: prefill.zone });
    setError(null);
    // The box may stand below the window; bring the form into view once it is placed.
    const timer = window.setTimeout(
      () => form.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
      80,
    );
    return () => window.clearTimeout(timer);
    // Only a new request fills the form in again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillKey]);

  if (chartId === null) return null;

  async function save() {
    if (!draft || chartId === null) return;
    const existing = events.find((e) => e.id === draft.id);
    const event = eventOf(draft, chartId, existing?.zone ?? draft.zone ?? localZone());
    if (typeof event === "string") {
      setError(event);
      return;
    }
    try {
      await api.eventSave(event);
      setDraft(null);
      setError(null);
      await reload();
    } catch (reason) {
      setError(`Begivenheden kunne ikke gemmes: ${String(reason)}`);
    }
  }

  async function remove(id: number) {
    await api.eventDelete(id);
    setConfirmingDelete(null);
    await reload();
  }

  async function jump(event: LifeEvent, date: string) {
    try {
      const resolved = await api.localResolve(date, event.time, event.zone ?? localZone());
      setError(null);
      onJump(resolved.utc);
    } catch (reason) {
      setError(`Tidspunktet kan ikke bruges: ${String(reason)}`);
    }
  }

  const set = (change: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...change } : d));

  return (
    <Box
      id="events"
      title="Livsbegivenheder"
      className="life-events"
      actions={!draft && <button onClick={() => setDraft(draftOf(null))}>Ny begivenhed</button>}
    >

      {error && <p className="error">{error}</p>}

      {draft && (
        <div className="event-form" ref={form}>
          <label>
            Titel
            <input
              type="text"
              value={draft.title}
              autoFocus
              onChange={(e) => set({ title: e.target.value })}
            />
          </label>
          <label>
            Hvad er kendt?
            <select
              value={draft.precision}
              onChange={(e) => set({ precision: e.target.value as EventPrecision })}
            >
              {(Object.keys(PRECISION_NAMES) as EventPrecision[]).map((p) => (
                <option key={p} value={p}>
                  {PRECISION_NAMES[p]}
                </option>
              ))}
            </select>
          </label>
          {(draft.precision === "datetime" || draft.precision === "date") && (
            <label>
              Dato
              <input
                type="date"
                min="1800-01-01"
                max="2399-12-31"
                value={draft.date}
                onChange={(e) => set({ date: e.target.value })}
              />
            </label>
          )}
          {draft.precision === "datetime" && (
            <label>
              Klokkeslæt
              <input type="time" value={draft.time} onChange={(e) => set({ time: e.target.value })} />
            </label>
          )}
          {draft.precision === "month" && (
            <label>
              Måned og år
              <input
                type="month"
                min="1800-01"
                max="2399-12"
                value={draft.month}
                onChange={(e) => set({ month: e.target.value })}
              />
            </label>
          )}
          {draft.precision === "year" && (
            <label>
              Årstal
              <input
                type="number"
                min={1800}
                max={2399}
                value={draft.year}
                onChange={(e) => set({ year: e.target.value })}
              />
            </label>
          )}
          <label>
            Note
            <input type="text" value={draft.note} onChange={(e) => set({ note: e.target.value })} />
          </label>
          <p className="muted">
            {draft.precision === "date" &&
              "Klokkeslættet gemmes som ukendt. Ved beregning bruges kl. 12:00."}
            {draft.precision === "month" &&
              "Der gemmes ingen dag. Du vælger en dato, når begivenheden skal vises i Live Chart."}
            {draft.precision === "year" &&
              "Der gemmes hverken måned eller dag. Du vælger en dato, når begivenheden skal vises i Live Chart."}
          </p>
          <div className="actions">
            <button className="primary" onClick={save}>
              Gem
            </button>
            <button
              onClick={() => {
                setDraft(null);
                setError(null);
              }}
            >
              Fortryd
            </button>
          </div>
        </div>
      )}

      {events.length === 0 && !draft && <p className="muted">Ingen livsbegivenheder endnu.</p>}

      <ul className="event-list">
        {events.map((event) => {
          const id = event.id!;
          const date = eventDate(event);
          const bounds = date === null ? dateBounds(event) : null;
          return (
            <li key={id}>
              <div className="event-text">
                <strong>{event.title}</strong>
                <span className="muted">{formatEventWhen(event)}</span>
                {event.note && <span className="muted">{event.note}</span>}
              </div>
              <div className="event-actions">
                {date !== null ? (
                  <button
                    className="small"
                    onClick={() => jump(event, date)}
                    title={event.time === null ? "Klokkeslættet er ukendt; kl. 12:00 bruges" : undefined}
                  >
                    {jumpLabel}
                    {event.time === null ? " (kl. 12:00)" : ""}
                  </button>
                ) : (
                  <>
                    <input
                      type="date"
                      aria-label={`Vælg dato for ${event.title}`}
                      title="Vælg en dato, før begivenheden kan vises"
                      min={bounds!.min}
                      max={bounds!.max}
                      value={picked[id] ?? ""}
                      onChange={(e) => setPicked((p) => ({ ...p, [id]: e.target.value }))}
                    />
                    <button
                      className="small"
                      disabled={
                        !picked[id] || picked[id] < bounds!.min || picked[id] > bounds!.max
                      }
                      title="Vælg først en dato; kl. 12:00 bruges"
                      onClick={() => jump(event, picked[id])}
                    >
                      {jumpLabel} (kl. 12:00)
                    </button>
                  </>
                )}
                <button className="small" onClick={() => setDraft(draftOf(event))}>
                  Rediger
                </button>
                {confirmingDelete === id ? (
                  <>
                    <button className="small danger" onClick={() => remove(id)}>
                      Bekræft
                    </button>
                    <button className="small" onClick={() => setConfirmingDelete(null)}>
                      Fortryd
                    </button>
                  </>
                ) : (
                  <button className="small" onClick={() => setConfirmingDelete(id)}>
                    Slet
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Box>
  );
}
