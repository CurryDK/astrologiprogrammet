import { useEffect, useState } from "react";
import { api } from "../api";
import {
  POINT_GLYPHS,
  POINT_NAMES,
  SIGN_GLYPHS,
  SIGN_NAMES,
  birthInputOf,
  formatDegree,
  formatMoment,
  formatMomentLong,
  formatOffset,
  localZone,
  type ChartRecord,
  type RetrogradeReply,
  type SynodicEvent,
  type SynodicReply,
} from "../astro";
import { SYNODIC_NAMES, formatDaysFrom } from "../eventText";
import { RetrogradePanel } from "../components/RetrogradePanel";
import { useSettings } from "../settings";

type Props = {
  /** The chart whose moments can be chosen as reference; none in the standalone overview. */
  record?: ChartRecord | null;
  onBack?: () => void;
};

type Reference = "now" | "chosen" | "natal" | "solarReturn";
type Tab = "synodic" | "retrograde";

/**
 * Planet cycles (decision "Planetcyklusser" of 18 November 2026), two tabs
 * on one page sharing one reference moment: now, a chosen date and time, or
 * the moment of the selected chart or its Solar Return.
 *
 * Synodic cycles (specification §10, decision of 18 November 2026, point 6):
 * for each planet the latest and next conjunction with the Sun and, where
 * there is one, opposition. Retrograde cycles: see `RetrogradePanel`.
 */
export function SynodicView({ record = null, onBack }: Props) {
  const { settings } = useSettings();
  const zone = localZone();
  const [reference, setReference] = useState<Reference>("now");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("12:00");
  // Bumped by "Nu" so the overview is taken again at the present moment.
  const [refresh, setRefresh] = useState(0);
  const [tab, setTab] = useState<Tab>("synodic");
  const [result, setResult] = useState<SynodicReply | null>(null);
  const [retrograde, setRetrograde] = useState<RetrogradeReply | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const moment = async (): Promise<string | null> => {
      if (reference === "chosen") return (await api.localResolve(date, time || null, zone)).utc;
      if (reference === "natal" && record) return (await api.birthResolve(birthInputOf(record))).utc;
      if (reference === "solarReturn" && record?.id != null) {
        const active = await api.solarReturn({
          chartId: record.id,
          age: null,
          orbs: settings.orbs,
          lotOrb: settings.lots.orb,
          lotExactOrb: settings.lots.exactOrb,
        });
        return active.moment.utc;
      }
      return null;
    };
    moment()
      .then(async (at) => {
        // "Now" is taken once, so both tabs stand on the same moment.
        const synodic = await api.synodicCycles(at, zone);
        return [synodic, await api.retrogradeCycles(synodic.at.utc, zone)] as const;
      })
      .then(([synodic, cycles]) => {
        if (cancelled) return;
        setResult(synodic);
        setRetrograde(cycles);
        setError(null);
      })
      .catch((reason) => {
        if (!cancelled) setError(String(reason));
      });
    return () => {
      cancelled = true;
    };
    // The orbs do not change a Solar Return's moment.
  }, [reference, date, time, zone, record, refresh]);

  const cell = (event: SynodicEvent | null, relevant: boolean) => {
    if (!relevant) return <td className="muted">–</td>;
    if (!event) return <td className="muted">ikke fundet</td>;
    return (
      <td>
        {event.kind !== "conjunction" && event.kind !== "opposition" && (
          <div className="synodic-kind">{SYNODIC_NAMES[event.kind]}</div>
        )}
        <div>{formatMoment(event.at, true)}</div>
        <div>
          {formatDegree(event.position)}{" "}
          <span className="glyph-inline" title={SIGN_NAMES[event.position.sign]}>
            {SIGN_GLYPHS[event.position.sign]}
          </span>
        </div>
        <div className="muted">{formatDaysFrom(event.days)}</div>
      </td>
    );
  };

  const choice = (value: Reference, label: string) => (
    <label className="check">
      <input type="radio" name="synodic-reference" checked={reference === value} onChange={() => setReference(value)} />
      {label}
    </label>
  );

  return (
    <div className="report-view">
      <header className="chart-header">
        <div className="chart-title">
          <h1>Planetcyklusser{record ? ` · ${record.name}` : ""}</h1>
          {result && (
            <p className="muted">
              Referencetidspunkt: {formatMomentLong(result.at)} · UTC{formatOffset(result.at.offsetSeconds)}
            </p>
          )}
        </div>
        {onBack && (
          <div className="actions">
            <button onClick={onBack}>Natalhoroskop</button>
          </div>
        )}
      </header>

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "synodic"} onClick={() => setTab("synodic")}>
          Synodiske cyklusser
        </button>
        <button role="tab" aria-selected={tab === "retrograde"} onClick={() => setTab("retrograde")}>
          Retrogradcyklusser
        </button>
      </div>

      <section className="panel report-controls">
        {choice("now", "Lige nu")}
        {reference === "now" && <button onClick={() => setRefresh((n) => n + 1)}>Nu</button>}
        {choice("chosen", "Valgt dato og klokkeslæt")}
        {reference === "chosen" && (
          <>
            <input type="date" aria-label="Dato" value={date} onChange={(e) => setDate(e.target.value)} />
            <input type="time" aria-label="Klokkeslæt" value={time} onChange={(e) => setTime(e.target.value)} />
          </>
        )}
        {record && choice("natal", `Natalhoroskopets tidspunkt (${record.name})`)}
        {record && record.id !== null && choice("solarReturn", "Det aktive Solar Return")}
      </section>

      {error && <p className="error">Beregningen mislykkedes: {error}</p>}

      {tab === "retrograde" && retrograde && <RetrogradePanel reply={retrograde} />}

      {tab === "synodic" && result && (
        <section className="panel">
          <table className="report-table synodic-table">
            <thead>
              <tr>
                <th>Planet</th>
                <th>Position og retning</th>
                <th>Seneste konjunktion med Solen</th>
                <th>Næste konjunktion med Solen</th>
                <th>Seneste opposition</th>
                <th>Næste opposition</th>
              </tr>
            </thead>
            <tbody>
              {result.cycles.map((cycle) => {
                const opposes = cycle.body !== "mercury" && cycle.body !== "venus";
                return (
                  <tr key={cycle.body}>
                    <td>
                      <span className="glyph" style={{ color: settings.colors.bodies[cycle.body] }}>
                        {POINT_GLYPHS[cycle.body]}
                      </span>{" "}
                      {POINT_NAMES[cycle.body]}
                    </td>
                    <td>
                      <div>
                        {formatDegree(cycle.position)}{" "}
                        <span className="glyph-inline" title={SIGN_NAMES[cycle.position.sign]}>
                          {SIGN_GLYPHS[cycle.position.sign]}
                        </span>
                      </div>
                      <div className="muted">{cycle.retrograde ? "Retrograd" : "Direkte"}</div>
                    </td>
                    {cell(cycle.lastConjunction, true)}
                    {cell(cycle.nextConjunction, true)}
                    {cell(cycle.lastOpposition, opposes)}
                    {cell(cycle.nextOpposition, opposes)}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="muted legend">
            Tidspunkter vises i computerens tidszone. Positionen er planetens ved mødet med Solen. Merkur
            og Venus står aldrig i opposition til Solen; deres konjunktioner er øvre (direkte, bag Solen)
            eller nedre (retrograd, mellem Jorden og Solen).
          </p>
        </section>
      )}
    </div>
  );
}
