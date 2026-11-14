import { useEffect, useState } from "react";
import { api } from "../api";
import {
  POINT_GLYPHS,
  POINT_NAMES,
  SIGN_GLYPHS,
  SIGN_NAMES,
  birthInputOf,
  formatMoment,
  type ChartRecord,
  type ProfectionMonth,
  type ProfectionReport,
} from "../astro";
import { useSettings } from "../settings";

/** Highest age the backend calculates a profection year for. */
const MAX_AGE = 150;

const dayMonthFormat = new Intl.DateTimeFormat("da-DK", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** "4. feb." — the start date of a month in the timeline. */
function dayAndMonth(local: string): string {
  const date = new Date(`${local.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? local : dayMonthFormat.format(date);
}

/**
 * Annual and monthly profections of a natal chart (specification §7): the
 * year's Time Lord, a timeline of the 12 months and an overview table,
 * with navigation between profection years. Draws only; the backend
 * calculates.
 */
export function ProfectionPanel({ record }: { record: ChartRecord }) {
  const { settings } = useSettings();
  const { yearStart, leapDay, showTimes } = settings.profections;
  // null: the profection year that holds today.
  const [age, setAge] = useState<number | null>(null);
  const [report, setReport] = useState<ProfectionReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .profectionYear(birthInputOf(record), { yearStart, leapDay }, age)
      .then((result) => {
        if (cancelled) return;
        setReport(result);
        setError(null);
      })
      .catch((reason) => {
        if (!cancelled) setError(String(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [record, yearStart, leapDay, age]);

  if (error) {
    return (
      <section className="panel profections">
        <h2>Profektioner</h2>
        <p className="error">Profektionerne kunne ikke beregnes: {error}</p>
        {age !== null && <button onClick={() => setAge(null)}>Gå til i dag</button>}
      </section>
    );
  }
  if (!report) return null;

  const { year, currentAge, currentMonth, timeAssumed } = report;
  // Clock times would be false precision when the birth time is a guess.
  const withTime = showTimes && !timeAssumed;
  const isCurrentYear = currentAge === year.age;
  const range = (period: { start: { local: string }; end: { local: string } }) =>
    `${formatMoment(period.start, withTime)} – ${formatMoment(period.end, withTime)}`;
  const bodyColor = (month: Pick<ProfectionMonth, "ruler">) => settings.colors.bodies[month.ruler];

  return (
    <section className="panel profections">
      <div className="profection-head">
        <h2>Profektioner</h2>
        <div className="profection-nav">
          <button
            onClick={() => setAge(year.age - 1)}
            disabled={year.age === 0}
            aria-label="Forrige profektionsår"
          >
            ‹ Forrige år
          </button>
          <span className="profection-age">
            <strong>Alder {year.age}</strong>
            {isCurrentYear && <span className="now-tag">nu</span>}
          </span>
          <button
            onClick={() => setAge(year.age + 1)}
            disabled={year.age >= MAX_AGE}
            aria-label="Næste profektionsår"
          >
            Næste år ›
          </button>
          {!isCurrentYear && currentAge !== null && (
            <button onClick={() => setAge(null)}>Gå til i dag</button>
          )}
        </div>
      </div>

      <div className="time-lord">
        <span className="time-lord-glyph glyph" style={{ color: settings.colors.bodies[year.timeLord] }}>
          {POINT_GLYPHS[year.timeLord]}
        </span>
        <div>
          <div className="time-lord-label">Årets Time Lord</div>
          <div className="time-lord-name">{POINT_NAMES[year.timeLord]}</div>
          <div className="muted">
            {year.house}. hus · <span className="glyph-inline">{SIGN_GLYPHS[year.sign]}</span>{" "}
            {SIGN_NAMES[year.sign]} · {range(year)}
          </div>
        </div>
      </div>

      <ol className="profection-timeline" aria-label="Årets 12 profektionsmåneder">
        {year.months.map((month) => {
          const current = month.number === currentMonth;
          return (
            <li
              key={month.number}
              className={current ? "current" : undefined}
              aria-current={current ? "true" : undefined}
              title={`Måned ${month.number}: ${range(month)} · ${month.house}. hus, ${
                SIGN_NAMES[month.sign]
              }, ${POINT_NAMES[month.ruler]}`}
            >
              <span className="timeline-number">
                {month.number}
                {current && <span className="now-tag">nu</span>}
              </span>
              <span className="glyph">{SIGN_GLYPHS[month.sign]}</span>
              <span className="glyph" style={{ color: bodyColor(month) }}>
                {POINT_GLYPHS[month.ruler]}
              </span>
              <span className="timeline-date">{dayAndMonth(month.start.local)}</span>
            </li>
          );
        })}
      </ol>

      <table className="profection-table">
        <thead>
          <tr>
            <th>Måned</th>
            <th>Start</th>
            <th>Slut</th>
            <th>Hus</th>
            <th colSpan={2}>Tegn</th>
            <th colSpan={2}>Hersker</th>
          </tr>
        </thead>
        <tbody>
          {year.months.map((month) => {
            const current = month.number === currentMonth;
            return (
              <tr key={month.number} className={current ? "current" : undefined}>
                <td>
                  {month.number}
                  {current && <span className="now-tag">nu</span>}
                </td>
                <td>{formatMoment(month.start, withTime)}</td>
                <td>{formatMoment(month.end, withTime)}</td>
                <td>{month.house}</td>
                <td className="glyph">{SIGN_GLYPHS[month.sign]}</td>
                <td>{SIGN_NAMES[month.sign]}</td>
                <td className="glyph" style={{ color: bodyColor(month) }}>
                  {POINT_GLYPHS[month.ruler]}
                </td>
                <td>{POINT_NAMES[month.ruler]}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="muted legend">
        {yearStart === "birthClockTime" &&
          "Profektionsåret begynder på fødselsdagen ved fødselsklokkeslættet."}
        {yearStart === "midnight" && "Profektionsåret begynder på fødselsdagen kl. 00:00."}
        {yearStart === "solarReturn" &&
          "Profektionsåret begynder, når Solen vender tilbage til sin fødselsposition."}{" "}
        Året er delt i 12 præcist lige lange måneder; en måned slutter i samme øjeblik, den næste
        begynder. Datoerne gælder fødestedets tidszone. Kan ændres under Indstillinger.
      </p>
      {timeAssumed && (
        <p className="notice">
          Fødselstidspunktet er ukendt, og kl. 12:00 er anvendt.{" "}
          {yearStart === "midnight"
            ? "Datoerne påvirkes ikke af det."
            : "Månedernes skift kan derfor ligge op til 12 timer forkert, og der vises kun datoer."}{" "}
          Ascendanten er også usikker, og dermed hvilke huse, tegn og herskere profektionerne
          falder i.
        </p>
      )}
    </section>
  );
}
