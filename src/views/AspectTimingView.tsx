import { useState } from "react";
import { api } from "../api";
import {
  ASPECT_GLYPHS,
  ASPECT_NAMES,
  SIGN_GLYPHS,
  SIGN_NAMES,
  birthInputOf,
  formatDegree,
  formatMoment,
  formatMomentLong,
  formatOrb,
  localZone,
  type AspectCourse,
  type ChartRecord,
  type CourseResult,
  type Moment,
  type ZodiacPoint,
} from "../astro";
import { PointFilter } from "../components/PointFilter";
import { defaultPointChoice, formatDays, layerPointName } from "../eventText";
import { useSettings } from "../settings";
import { GROUP_LABELS } from "./EventSearchView";

type Props = {
  record: ChartRecord;
  onBack: () => void;
  /** Open the Live Chart at a UTC instant. */
  onLive: (at: string) => void;
};

type Period = "active" | "week" | "month" | "quarter" | "halfYear" | "year" | "profection" | "custom";

const PERIODS: [Period, string][] = [
  ["active", "Aktive på tidspunktet"],
  ["week", "En uge"],
  ["month", "En måned"],
  ["quarter", "Tre måneder"],
  ["halfYear", "Seks måneder"],
  ["year", "Et år"],
  ["profection", "Det aktuelle profektionsår"],
  ["custom", "Valgfri start- og slutdato"],
];

/** A UTC instant moved forward by days or calendar months. */
function later(utc: string, days: number, months: number): string {
  const date = new Date(utc);
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString();
}

function position(point: ZodiacPoint) {
  return (
    <>
      {formatDegree(point)}{" "}
      <span className="glyph-inline" title={SIGN_NAMES[point.sign]}>
        {SIGN_GLYPHS[point.sign]}
      </span>
    </>
  );
}

const when = (moment: Moment | null) => (moment ? formatMoment(moment, true) : "uden for det fulgte tidsrum");

/** Days between two moments of a period; null when an end is unknown. */
function periodDays(period: AspectCourse["periods"][number]): number | null {
  if (!period.enter || !period.leave) return null;
  return (Date.parse(period.leave.utc) - Date.parse(period.enter.utc)) / 86_400_000;
}

/**
 * Aspect timing report (decision of 18 November 2026, point 10): the
 * course of each aspect through its orb, not only its exact moment. For
 * the aspects active at a moment or at some time in a period: the pair and
 * positions, the orb and applying/separating at the reference moment, when
 * it enters the orb, every exact pass, when it leaves the orb, and the
 * time within orb with interrupted stays listed separately.
 */
export function AspectTimingView({ record, onBack, onLive }: Props) {
  const { settings, update } = useSettings();
  const zone = localZone();
  const groups = settings.timing.groups;
  const [period, setPeriod] = useState<Period>("active");
  // The reference moment; an empty date means now.
  const [date, setDate] = useState("");
  const [time, setTime] = useState("12:00");
  const [start, setStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [end, setEnd] = useState(() => later(new Date().toISOString(), 0, 1).slice(0, 10));
  const [choice, setChoice] = useState(() => defaultPointChoice(settings));
  const [result, setResult] = useState<CourseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const birth = birthInputOf(record);
      const at = date ? (await api.localResolve(date, time || null, zone)).utc : new Date().toISOString();
      let from = at;
      let to = at;
      if (period === "week") to = later(at, 7, 0);
      if (period === "month") to = later(at, 0, 1);
      if (period === "quarter") to = later(at, 0, 3);
      if (period === "halfYear") to = later(at, 0, 6);
      if (period === "year") to = later(at, 0, 12);
      if (period === "profection") {
        const year = (await api.profectionYear(birth, settings.profections, null, at)).year;
        from = year.start.utc;
        to = year.end.utc;
      }
      if (period === "custom") {
        from = (await api.localResolve(start, "00:00", zone)).utc;
        to = (await api.localResolve(end, "23:59", zone)).utc;
      }
      const found = await api.aspectCourses(
        birth,
        {
          at,
          start: from,
          end: to,
          transitBodies: choice.transitBodies,
          progressedPoints: choice.progressedPoints,
          natalPoints: choice.natalPoints,
          aspectKinds: choice.kinds,
          ...groups,
          transitOrb: settings.transits.orb,
          progressedOrb: settings.progressions.orb,
          angleMethod: settings.progressions.angleMethod,
          birthTimeKnown: record.birthTime !== null,
        },
        zone,
      );
      setResult(found);
    } catch (reason) {
      setError(String(reason));
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="report-view">
      <header className="chart-header">
        <div className="chart-title">
          <h1>Aspekttidsrapport · {record.name}</h1>
        </div>
        <div className="actions">
          <button onClick={onBack}>Natalhoroskop</button>
        </div>
      </header>

      {record.birthTime === null && (
        <p className="notice">
          Fødselstidspunktet er ukendt, og kl. 12:00 er anvendt. Progressive akser udelades. Forløb med
          progressive punkter eller natal Måne er markeret ≈: deres tidspunkter kan ligge langt fra de
          viste.
        </p>
      )}

      <div className="report-columns">
        <section className="panel">
          <h2>Tidspunkt og periode</h2>
          <div className="report-controls">
            <label>
              Referencetidspunkt
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label>
              Klokkeslæt
              <input type="time" value={time} disabled={!date} onChange={(e) => setTime(e.target.value)} />
            </label>
            <button onClick={() => setDate("")} disabled={!date}>
              Nu
            </button>
          </div>
          <p className="muted legend">
            Uden dato bruges nuet. Positioner, orb og A/S gælder referencetidspunktet; de faste perioder
            begynder dér.
          </p>
          <div className="check-list">
            {PERIODS.map(([value, label]) => (
              <label key={value} className="check">
                <input type="radio" name="timing-period" checked={period === value} onChange={() => setPeriod(value)} />
                {label}
              </label>
            ))}
          </div>
          {period === "custom" && (
            <div className="report-controls">
              <label>
                Fra
                <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
              </label>
              <label>
                Til
                <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
              </label>
            </div>
          )}
          <h2>Kombinationer</h2>
          <div className="check-list">
            {GROUP_LABELS.map(([key, label]) => (
              <label key={key} className="check">
                <input
                  type="checkbox"
                  checked={groups[key]}
                  onChange={(e) =>
                    update((s) => ({
                      ...s,
                      timing: { ...s.timing, groups: { ...s.timing.groups, [key]: e.target.checked } },
                    }))
                  }
                />
                {label}
              </label>
            ))}
          </div>
          <p className="muted legend">
            Orb: transitter {formatOrb(settings.transits.orb)}, progressioner{" "}
            {formatOrb(settings.progressions.orb)} (ændres under Indstillinger).
          </p>
          <div className="actions">
            <button className="primary" onClick={run} disabled={busy}>
              {busy ? "Beregner …" : "Vis rapport"}
            </button>
          </div>
        </section>

        <section className="panel">
          <h2>Planeter, punkter og aspekttyper</h2>
          <PointFilter choice={choice} onChange={setChoice} settings={settings} />
        </section>
      </div>

      {error && <p className="error">Beregningen mislykkedes: {error}</p>}

      {result && (
        <section className="panel">
          <h2>
            {result.courses.length} {result.courses.length === 1 ? "aspekt" : "aspekter"}
          </h2>
          <p className="muted">
            Referencetidspunkt: {formatMomentLong(result.at)}
            {result.start.utc !== result.end.utc &&
              ` · periode: ${formatMoment(result.start, true)} – ${formatMoment(result.end, true)}`}
          </p>
          {result.truncated && (
            <p className="notice">
              Der blev fundet flere, end der vises. Kun de tidligste {result.courses.length} er med;
              vælg en kortere periode eller færre objekter.
            </p>
          )}
          {result.courses.length > 0 && (
            <table className="report-table timing-table">
              <thead>
                <tr>
                  <th>Aspekt</th>
                  <th>Positioner</th>
                  <th>Orb · A/S</th>
                  <th>Ind i orb</th>
                  <th>Eksakt</th>
                  <th>Ud af orb</th>
                  <th>Inden for orb</th>
                </tr>
              </thead>
              <tbody>
                {result.courses.map((course, index) => {
                  const first = course.periods[0];
                  const last = course.periods[course.periods.length - 1];
                  const complete = course.periods.every((p) => p.enter && p.leave);
                  return (
                    <tr key={index}>
                      <td>
                        {course.uncertain && <span title="Usikkert: fødselstidspunktet er ukendt">≈ </span>}
                        {layerPointName(course.a)}{" "}
                        <span
                          className="glyph-inline"
                          style={{ color: settings.colors.aspects[course.kind] }}
                          title={ASPECT_NAMES[course.kind]}
                        >
                          {ASPECT_GLYPHS[course.kind]}
                        </span>{" "}
                        {layerPointName(course.b)}
                      </td>
                      <td>
                        <div>{position(course.positionA)}</div>
                        <div>{position(course.positionB)}</div>
                      </td>
                      <td>
                        {course.orb === null ? (
                          <span className="muted">uden for orb</span>
                        ) : (
                          <>
                            {formatOrb(course.orb)} · {course.applying ? "A" : "S"}
                          </>
                        )}
                      </td>
                      <td>{when(first.enter)}</td>
                      <td>
                        {course.exact.length === 0 ? (
                          <span className="muted">bliver ikke eksakt</span>
                        ) : (
                          course.exact.map((moment) => (
                            <div key={moment.utc}>
                              <button className="link" title="Vis i Live Chart" onClick={() => onLive(moment.utc)}>
                                {formatMoment(moment, true)}
                              </button>
                            </div>
                          ))
                        )}
                      </td>
                      <td>{when(last.leave)}</td>
                      <td>
                        <div>
                          {formatDays(course.daysInOrb)}
                          {!complete && " +"}
                        </div>
                        {course.periods.length > 1 && (
                          <div className="muted">
                            Afbrudt, {course.periods.length} perioder:
                            {course.periods.map((p, i) => {
                              const days = periodDays(p);
                              return (
                                <div key={i}>
                                  {when(p.enter)} – {when(p.leave)}
                                  {days !== null && ` (${formatDays(days)})`}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <p className="muted legend">
            A = applikativ, S = separativ på referencetidspunktet. Et aspekt er med, når det er inden for
            orb på et tidspunkt i perioden, også hvis det ikke bliver eksakt i den. Hele forløbet vises,
            også uden for perioden. “+” betyder, at et ophold inden for orb fortsætter uden for det
            tidsrum, forløbet følges i. Tidspunkter vises i computerens tidszone.
          </p>
        </section>
      )}
    </div>
  );
}
