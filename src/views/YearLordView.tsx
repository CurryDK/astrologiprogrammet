import { useEffect, useState } from "react";
import { api } from "../api";
import {
  ASPECT_GLYPHS,
  ASPECT_NAMES,
  POINT_GLYPHS,
  POINT_NAMES,
  SIGN_GLYPHS,
  SIGN_NAMES,
  birthInputOf,
  formatDegree,
  formatMoment,
  formatOrb,
  isBody,
  localZone,
  type Aspect,
  type AspectGroups,
  type Body,
  type BodyPosition,
  type ChartRecord,
  type ComputedChart,
  type ConditionReport,
  type PlanetCondition,
  type ProfectionReport,
  type SearchEvent,
  type SearchOptions,
  type SearchResult,
  type SolarReturn,
} from "../astro";
import { analysisLines } from "../chartAnalysis";
import { RATING_NAMES } from "../conditionText";
import { defaultPointChoice, eventText } from "../eventText";
import { useSettings } from "../settings";

type Props = {
  record: ChartRecord;
  onBack: () => void;
  /** Open the Live Chart at a UTC instant. */
  onLive: (at: string) => void;
};

/** Everything the report shows for one profection year. */
type Report = {
  profection: ProfectionReport;
  natal: ComputedChart;
  condition: ConditionReport;
  solarReturn: SolarReturn | null;
  returnCondition: ConditionReport | null;
  /** Exact transits to the natal Lord of the Year within the profection year. */
  toLord: SearchResult;
  /** The Lord of the Year as a transiting planet within the profection year. */
  byLord: SearchResult;
};

const NO_GROUPS: AspectGroups = {
  transitToNatal: false,
  transitToTransit: false,
  progressedToNatal: false,
  progressedToProgressed: false,
};

/** A search with everything switched off, to switch single things on in. */
function emptySearch(start: string, end: string, angleMethod: SearchOptions["angleMethod"]): SearchOptions {
  return {
    ...NO_GROUPS,
    start,
    end,
    transitBodies: [],
    progressedPoints: [],
    natalPoints: [],
    aspectKinds: ["conjunction", "sextile", "square", "trine", "opposition"],
    transitSignChanges: false,
    transitStations: false,
    progressedSignChanges: false,
    progressedStations: false,
    progressedMoonHouses: false,
    progressedAngleSigns: false,
    lunationsMajor: false,
    lunationsMinor: false,
    progressedBounds: false,
    progressedDecans: false,
    angleMethod,
    birthTimeKnown: true,
  };
}

/**
 * Year-lord report (decision of 18 November 2026, point 9): the annual
 * profection and its Lord of the Year, the lord's natal placement,
 * aspects, Planetary Condition and rulerships, the planets in the
 * activated house, the lord in the Solar Return, the exact transits to and
 * by the lord in the profection year, and the 12 monthly profections.
 * Everything comes from the calculations of the other screens; there is no
 * score and no verdict.
 */
export function YearLordView({ record, onBack, onLive }: Props) {
  const { settings } = useSettings();
  const zone = localZone();
  // null: the profection year that holds today.
  const [age, setAge] = useState<number | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { cazimi, combust, beams, colors, groups, analysisNeutral } = settings.condition;
  const { yearStart, leapDay, showTimes } = settings.profections;

  useEffect(() => {
    let cancelled = false;
    const birth = birthInputOf(record);
    const limits = { cazimi, combust, beams };
    const load = async (): Promise<Report> => {
      const [profection, natal, condition] = await Promise.all([
        api.profectionYear(birth, { yearStart, leapDay }, age),
        api.chartCompute(birth, settings.orbs, {
          sectOverride: record.sectOverride,
          orb: settings.lots.orb,
          exactOrb: settings.lots.exactOrb,
        }),
        api.planetaryCondition(birth, record.sectOverride, limits),
      ]);
      const year = profection.year;
      const lord = year.timeLord;
      const solarReturn =
        record.id === null
          ? null
          : await api.solarReturn({
              chartId: record.id,
              age: year.age,
              orbs: settings.orbs,
              lotOrb: settings.lots.orb,
              lotExactOrb: settings.lots.exactOrb,
            });
      const returnCondition =
        solarReturn && !solarReturn.timeAssumed
          ? await api.planetaryConditionAt(
              {
                utc: solarReturn.moment.utc,
                latitude: solarReturn.place.latitude,
                longitude: solarReturn.place.longitude,
                zone: solarReturn.place.zone,
                offsetSeconds: solarReturn.place.offsetSeconds,
              },
              solarReturn.sectOverride,
              limits,
            )
          : null;
      const points = defaultPointChoice(settings);
      const base = emptySearch(year.start.utc, year.end.utc, settings.progressions.angleMethod);
      const [toLord, byLord] = await Promise.all([
        api.eventSearch(
          birth,
          { ...base, transitToNatal: true, transitBodies: points.transitBodies, natalPoints: [lord] },
          zone,
        ),
        api.eventSearch(
          birth,
          {
            ...base,
            transitToNatal: true,
            transitSignChanges: true,
            transitStations: true,
            transitBodies: [lord],
            natalPoints: points.natalPoints,
          },
          zone,
        ),
      ]);
      return { profection, natal, condition, solarReturn, returnCondition, toLord, byLord };
    };
    load()
      .then((value) => {
        if (cancelled) return;
        setReport(value);
        setError(null);
      })
      .catch((reason) => {
        if (!cancelled) setError(String(reason));
      });
    return () => {
      cancelled = true;
    };
    // `settings` as a whole changes with every box that opens; the parts used are listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record, age, cazimi, combust, beams, yearStart, leapDay, settings.orbs, settings.lots.orb, settings.lots.exactOrb, zone]);

  const glyph = (body: Body) => (
    <span className="glyph-inline" style={{ color: settings.colors.bodies[body] }} title={POINT_NAMES[body]}>
      {POINT_GLYPHS[body]}
    </span>
  );
  const sign = (name: BodyPosition["sign"]) => (
    <span className="glyph-inline" title={SIGN_NAMES[name]}>
      {SIGN_GLYPHS[name]}
    </span>
  );

  const placement = (position: BodyPosition, withHouse: boolean) => (
    <>
      {glyph(position.body)} {POINT_NAMES[position.body]} · {formatDegree(position)} {sign(position.sign)}{" "}
      {SIGN_NAMES[position.sign]}
      {position.retrograde && " · retrograd"}
      {withHouse && ` · ${position.house}. hus`}
    </>
  );

  /** The aspects of one planet to the other bodies of the same chart. */
  const aspectsOf = (aspects: Aspect[], body: Body) => {
    const found = aspects.filter(
      (aspect) => (aspect.a === body || aspect.b === body) && isBody(aspect.a) && isBody(aspect.b),
    );
    if (found.length === 0) return <p className="muted">Ingen aspekter inden for orb.</p>;
    return (
      <ul className="report-list">
        {found.map((aspect) => {
          const other = (aspect.a === body ? aspect.b : aspect.a) as Body;
          return (
            <li key={`${aspect.a}-${aspect.b}`}>
              <span
                className="glyph-inline"
                style={{ color: settings.colors.aspects[aspect.kind] }}
                title={ASPECT_NAMES[aspect.kind]}
              >
                {ASPECT_GLYPHS[aspect.kind]}
              </span>{" "}
              {glyph(other)} {POINT_NAMES[other]} · {formatOrb(aspect.orb)} {aspect.applying ? "A" : "S"}
              {aspect.outOfSign && " · ude af tegn"}
            </li>
          );
        })}
      </ul>
    );
  };

  /** The conditions of one planet, as in Chart Analysis. */
  const conditionsOf = (planet: PlanetCondition | undefined) => {
    if (!planet) return <p className="muted">Planetary Condition omfatter kun de syv traditionelle planeter.</p>;
    const lines = analysisLines(planet, groups, analysisNeutral);
    if (lines.length === 0) return <p className="muted">Ingen betingelser i de viste kategorier.</p>;
    return (
      <div className="ca-planet">
        <ul>
          {lines.map((line, index) => {
            const filled = line.rating === "verySupportive" || line.rating === "veryChallenging";
            return (
              <li key={index} title={line.rule}>
                {line.rating === null ? (
                  <span className="ca-bar fact" title="Fakta uden vurdering" />
                ) : (
                  <span
                    className="ca-bar"
                    title={RATING_NAMES[line.rating]}
                    style={{
                      borderColor: colors[line.rating],
                      background: filled ? colors[line.rating] : "transparent",
                    }}
                  />
                )}
                <span>{line.text}</span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  const eventTable = (result: SearchResult, empty: string) => {
    if (result.events.length === 0) return <p className="muted">{empty}</p>;
    return (
      <>
        {result.truncated && (
          <p className="notice">Der er flere, end der vises; kun de tidligste {result.events.length} er med.</p>
        )}
        <table className="report-table">
          <thead>
            <tr>
              <th>Dato og klokkeslæt</th>
              <th>Begivenhed</th>
              <th>Position</th>
            </tr>
          </thead>
          <tbody>
            {result.events.map((event: SearchEvent, index) => (
              <tr key={index}>
                <td className="number">
                  {event.uncertain && <span title="Usikkert: fødselstidspunktet er ukendt">≈ </span>}
                  <button className="link" title="Vis i Live Chart" onClick={() => onLive(event.utc)}>
                    {formatMoment(event.at, true)}
                  </button>
                </td>
                <td>{eventText(event)}</td>
                <td>
                  {formatDegree(event.position)} {sign(event.position.sign)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    );
  };

  const year = report?.profection.year;
  const lord = year?.timeLord;
  const natalLord = report && lord ? report.natal.chart.positions.find((p) => p.body === lord) : undefined;
  const planetOf = (conditions: ConditionReport | null, body: Body) =>
    conditions?.planets.find((planet) => planet.body === body);
  const inHouse = report && year ? report.natal.chart.positions.filter((p) => p.house === year.house) : [];
  const rulerships = report && lord ? report.natal.chart.houses.filter((house) => house.ruler === lord) : [];
  const returnLord =
    report?.solarReturn && lord
      ? report.solarReturn.computed.chart.positions.find((p) => p.body === lord)
      : undefined;

  return (
    <div className="report-view">
      <header className="chart-header">
        <div className="chart-title">
          <h1>Årsherskerrapport · {record.name}</h1>
          {year && lord && (
            <p className="muted">
              Alder {year.age} · {formatMoment(year.start, showTimes)} – {formatMoment(year.end, showTimes)} ·
              Lord of the Year: {glyph(lord)} {POINT_NAMES[lord]}
            </p>
          )}
          {report?.profection.timeAssumed && (
            <p className="notice">
              Fødselstidspunktet er ukendt, og kl. 12:00 er anvendt. Ascendanten og dermed husene, det
              aktiverede hus og Lord of the Year er usikre, og Solar Return vises kun med positioner.
            </p>
          )}
        </div>
        <div className="actions">
          <button disabled={!year || year.age <= 0} onClick={() => year && setAge(year.age - 1)}>
            ◀ Forrige år
          </button>
          <button
            disabled={!report || year?.age === report.profection.currentAge}
            onClick={() => setAge(null)}
          >
            Aktuelt
          </button>
          <button disabled={!year} onClick={() => year && setAge(year.age + 1)}>
            Næste år ▶
          </button>
          <button onClick={onBack}>Natalhoroskop</button>
        </div>
      </header>

      {error && <p className="error">Beregningen mislykkedes: {error}</p>}

      {report && year && lord && (
        <>
          <details className="panel report-section" open>
            <summary>Profektioner</summary>
            <h3>Årlig profektion</h3>
            <p>
              Alder {year.age} · {formatMoment(year.start, showTimes)} – {formatMoment(year.end, showTimes)} ·{" "}
              {year.house}. hus · {sign(year.sign)} {SIGN_NAMES[year.sign]} · Lord of the Year: {glyph(lord)}{" "}
              {POINT_NAMES[lord]}
            </p>
            <h3>De 12 månedlige profektioner</h3>
            <table className="report-table">
              <thead>
                <tr>
                  <th>Måned</th>
                  <th>Periode</th>
                  <th>Hus</th>
                  <th>Tegn</th>
                  <th>Månedshersker</th>
                </tr>
              </thead>
              <tbody>
                {year.months.map((month) => (
                  <tr key={month.number} className={month.number === report.profection.currentMonth ? "current" : ""}>
                    <td className="number">{month.number}</td>
                    <td>
                      {formatMoment(month.start, showTimes)} – {formatMoment(month.end, showTimes)}
                    </td>
                    <td className="number">{month.house}</td>
                    <td>
                      {sign(month.sign)} {SIGN_NAMES[month.sign]}
                    </td>
                    <td>
                      {glyph(month.ruler)} {POINT_NAMES[month.ruler]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>

          <details className="panel report-section" open>
            <summary>Natal</summary>
            <h3>Årsherskerens natale placering</h3>
            {natalLord && <p>{placement(natalLord, true)}</p>}
            <h3>Aspekter til øvrige natale planeter</h3>
            {aspectsOf(report.natal.aspects, lord)}
            <h3>Årsherskerens natale Planetary Condition</h3>
            {conditionsOf(planetOf(report.condition, lord))}
            <h3>Årsherskerens natale husherskerskaber</h3>
            {rulerships.length === 0 ? (
              <p className="muted">Ingen.</p>
            ) : (
              <ul className="report-list">
                {rulerships.map((house) => (
                  <li key={house.number}>
                    {house.number}. hus · {sign(house.sign)} {SIGN_NAMES[house.sign]}
                  </li>
                ))}
              </ul>
            )}
            <h3>
              Planeter i det aktiverede natalhus ({year.house}. hus, {SIGN_NAMES[year.sign]})
            </h3>
            {inHouse.length === 0 ? (
              <p className="muted">Ingen planeter i huset.</p>
            ) : (
              inHouse.map((position) => (
                <div key={position.body} className="report-planet">
                  <p>{placement(position, false)}</p>
                  {conditionsOf(planetOf(report.condition, position.body))}
                </div>
              ))
            )}
          </details>

          <details className="panel report-section" open>
            <summary>Solar Return</summary>
            {!report.solarReturn || !returnLord ? (
              <p className="muted">Solar Return kan ikke beregnes for dette horoskop.</p>
            ) : (
              <>
                <p className="muted">
                  Solar Return {formatMoment(report.solarReturn.moment, true)} · {report.solarReturn.place.name}
                  {report.solarReturn.place.changed && " (valgt sted)"}
                </p>
                <h3>Årsherskeren i Solar Return</h3>
                <p>{placement(returnLord, !report.solarReturn.timeAssumed)}</p>
                <h3>Aspekter i Solar Return</h3>
                {aspectsOf(report.solarReturn.computed.aspects, lord)}
                <h3>Planetary Condition i Solar Return</h3>
                {report.solarReturn.timeAssumed ? (
                  <p className="muted">
                    Vises ikke: uden fødselstidspunkt har Solar Return hverken akser, huse eller sect.
                  </p>
                ) : (
                  conditionsOf(planetOf(report.returnCondition, lord))
                )}
              </>
            )}
          </details>

          <details className="panel report-section" open>
            <summary>Transitter</summary>
            <h3>
              Eksakte transitter til natal {POINT_NAMES[lord]} i profektionsåret
            </h3>
            {eventTable(report.toLord, "Ingen eksakte transitter i året.")}
            <h3>{POINT_NAMES[lord]} som transiterende planet i profektionsåret</h3>
            {eventTable(report.byLord, "Ingen eksakte aspekter, tegnskift eller stationeringer i året.")}
            <p className="muted legend">
              De transiterende planeter og natale punkter er dem, der er valgt til aspekter i Live Chart
              og ved natalhoroskopet. Tidspunkter vises i computerens tidszone.
            </p>
          </details>

          <p className="muted legend">
            Rapporten genbruger beregningerne for profektioner, Planetary Condition, Solar Return og
            transitter. Der er ingen point og ingen samlet vurdering.
          </p>
        </>
      )}
    </div>
  );
}
