import { useState } from "react";
import {
  CONDITION_GROUPS,
  PLANETS,
  POINT_GLYPHS,
  POINT_NAMES,
  RATINGS,
  SECT_NAMES,
  SIGN_GLYPHS,
  SIGN_NAMES,
  formatMoment,
  formatOrb,
  type Body,
  type ChartRecord,
  type Condition,
  type ConditionGroup,
  type PlanetCondition,
  type PlanetStations,
  type Rating,
  type StationMoment,
} from "../astro";
import {
  CONDITION_ROWS,
  GROUP_NAMES,
  RATING_NAMES,
  SPEED_NAMES,
  conditionDetail,
  rowOf,
  type ConditionRow,
} from "../conditionText";
import { useSettings, type Settings } from "../settings";
import { useConditionReport } from "../useConditionReport";

/** The mark of a condition: filled for "very", an outline otherwise, a grey dot for a plain fact. */
function Mark({ rating, colors }: { rating: Rating | null; colors: Settings["condition"]["colors"] }) {
  if (rating === null) return <span className="cond-mark fact" title="Fakta uden vurdering" />;
  const filled = rating === "verySupportive" || rating === "veryChallenging";
  return (
    <span
      className="cond-mark"
      title={RATING_NAMES[rating]}
      style={{ borderColor: colors[rating], background: filled ? colors[rating] : "transparent" }}
    />
  );
}

const sameRow = (condition: Condition, row: ConditionRow) =>
  condition.group === row.group && condition.kind === row.kind;

const PHASE_NAMES = {
  morning: "morgenstjerne",
  evening: "aftenstjerne",
  undetermined: "morgen/aften uafklaret (eksakt solkonjunktion)",
};

function stationText(label: string, station: StationMoment | null): string {
  if (!station) return `${label}: ikke fundet`;
  const turn = station.turns === "retrograde" ? "retrograd" : "direkte";
  return `${label}: ${formatMoment(station.at, true)} (${turn})`;
}

type Props = { record: ChartRecord };

/**
 * Planetary Condition of a natal chart (specification §6): a matrix with
 * the seven planets as columns and the conditions as rows, always visible,
 * and details per planet that fold out. Every condition is a separate
 * fact; there is no score. Draws only; the backend decides.
 */
export function ConditionPanel({ record }: Props) {
  const { settings, update } = useSettings();
  const { colors, groups } = settings.condition;
  const { report, error } = useConditionReport(record);
  const [open, setOpen] = useState<Partial<Record<Body, boolean>>>({});
  // The condition whose rule and source are shown: "body:index".
  const [explained, setExplained] = useState<string | null>(null);

  if (error) {
    return (
      <section className="panel">
        <h2>Planetary Condition</h2>
        <p className="error">Beregningen mislykkedes: {error}</p>
      </section>
    );
  }
  if (!report) return null;

  const setAll = (value: boolean) =>
    setOpen(Object.fromEntries(PLANETS.map((body) => [body, value])));
  const toggleGroup = (group: ConditionGroup, value: boolean) =>
    update((s) => ({
      ...s,
      condition: { ...s.condition, groups: { ...s.condition.groups, [group]: value } },
    }));
  const glyph = (body: Body) => (
    <span className="glyph-inline" style={{ color: settings.colors.bodies[body] }} title={POINT_NAMES[body]}>
      {POINT_GLYPHS[body]}
    </span>
  );
  const shownGroups = CONDITION_GROUPS.filter((group) => groups[group]);
  const stationsOf = (body: Body): PlanetStations | undefined =>
    report.stations.find((s) => s.body === body);

  /** Open a planet's details at one condition. */
  const show = (planet: PlanetCondition, condition: Condition) => {
    setOpen((current) => ({ ...current, [planet.body]: true }));
    setExplained(`${planet.body}:${planet.conditions.indexOf(condition)}`);
  };

  return (
    <section className="panel condition-panel">
      <div className="panel-head">
        <h2>Planetary Condition</h2>
        <div className="actions">
          <button onClick={() => setAll(true)}>Åbn alle</button>
          <button onClick={() => setAll(false)}>Luk alle</button>
        </div>
      </div>
      <p className="muted">
        {SECT_NAMES[report.sect]}
        {report.overridden && " (valgt manuelt)"} · Sect light: {POINT_NAMES[report.sectLight]}
      </p>

      <ul className="cond-legend">
        {RATINGS.map((rating) => (
          <li key={rating}>
            <Mark rating={rating} colors={colors} /> {RATING_NAMES[rating]}
          </li>
        ))}
        <li>
          <Mark rating={null} colors={colors} /> Fakta uden vurdering
        </li>
      </ul>

      <div className="cond-scroll">
        <table className="condition-matrix">
          <thead>
            <tr>
              <th></th>
              {report.planets.map((planet) => (
                <th key={planet.body} className="glyph" title={POINT_NAMES[planet.body]}>
                  <span style={{ color: settings.colors.bodies[planet.body] }}>
                    {POINT_GLYPHS[planet.body]}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Hastighed</th>
              {report.planets.map((planet) => (
                <td
                  key={planet.body}
                  className="cond-speed"
                  title={`${planet.retrograde ? "−" : ""}${formatOrb(Math.abs(planet.speed))} pr. dag`}
                >
                  {planet.speedStatus ? SPEED_NAMES[planet.speedStatus] : ""}
                </td>
              ))}
            </tr>
          </tbody>
          {shownGroups.map((group) => (
            <tbody key={group}>
              <tr className="group-row">
                <th colSpan={report.planets.length + 1}>{GROUP_NAMES[group]}</th>
              </tr>
              {CONDITION_ROWS.filter((row) => row.group === group).map((row) => (
                <tr key={row.kind}>
                  <th scope="row">{row.label}</th>
                  {report.planets.map((planet) => {
                    const found = planet.conditions.filter((c) => sameRow(c, row));
                    return (
                      <td key={planet.body}>
                        {found.map((condition, index) => (
                          <button
                            key={index}
                            className="cond-cell"
                            title={`${POINT_NAMES[planet.body]}: ${row.label}${
                              conditionDetail(condition) ? ` – ${conditionDetail(condition)}` : ""
                            }`}
                            onClick={() => show(planet, condition)}
                          >
                            <Mark rating={condition.rating} colors={colors} />
                            {condition.others.map((other) => (
                              <span key={other}>{glyph(other)}</span>
                            ))}
                          </button>
                        ))}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>

      <details className="cond-categories">
        <summary>Kategorier</summary>
        <div className="cond-category-list">
          {CONDITION_GROUPS.map((group) => (
            <label key={group} className="check">
              <input
                type="checkbox"
                checked={groups[group]}
                onChange={(e) => toggleGroup(group, e.target.checked)}
              />
              {GROUP_NAMES[group]}
            </label>
          ))}
        </div>
      </details>

      {report.planets.map((planet) => {
        const stations = stationsOf(planet.body);
        return (
          <details
            key={planet.body}
            className="cond-planet"
            open={open[planet.body] ?? false}
            onToggle={(e) => {
              const isOpen = e.currentTarget.open;
              setOpen((current) =>
                (current[planet.body] ?? false) === isOpen ? current : { ...current, [planet.body]: isOpen },
              );
            }}
          >
            <summary>
              {glyph(planet.body)} {POINT_NAMES[planet.body]}
              <span className="muted">
                {" "}
                · <span className="glyph-inline">{SIGN_GLYPHS[planet.sign]}</span> {SIGN_NAMES[planet.sign]} ·{" "}
                {planet.house}. hus
              </span>
            </summary>

            <ul className="cond-facts">
              <li>
                {planet.house}. hus ({planet.houseType}) ·{" "}
                {planet.sect ?? "sect uafklaret (eksakt solkonjunktion)"} ·{" "}
                {planet.aboveHorizon ? "over horisonten" : "under horisonten"}
              </li>
              {planet.sunDistance !== null && (
                <li>
                  {formatOrb(planet.sunDistance)} fra Solen
                  {planet.phase && ` · ${PHASE_NAMES[planet.phase]}`}
                </li>
              )}
              <li>
                {planet.retrograde ? "Retrograd" : "Direkte"} · {planet.retrograde ? "−" : ""}
                {formatOrb(Math.abs(planet.speed))} pr. dag
                {planet.speedStatus && ` (${SPEED_NAMES[planet.speedStatus]})`}
                {stations && (
                  <>
                    {" "}
                    · {stationText("Seneste station", stations.previous)} ·{" "}
                    {stationText("Næste station", stations.next)}
                  </>
                )}
              </li>
              <li>
                Herskere her: domicil {glyph(planet.lords.domicile)} · eksaltation{" "}
                {planet.lords.exaltation ? glyph(planet.lords.exaltation) : "–"} · triplicitet{" "}
                {planet.lords.triplicity.map((lord, index) => (
                  <span key={index}>{glyph(lord)} </span>
                ))}
                · bounds {glyph(planet.lords.bounds)} · decan {glyph(planet.lords.decan)}
              </li>
            </ul>

            {shownGroups.map((group) => {
              const found = planet.conditions
                .map((condition, index) => ({ condition, index }))
                .filter(({ condition }) => condition.group === group);
              if (found.length === 0) return null;
              return (
                <div key={group} className="cond-group">
                  <h3>{GROUP_NAMES[group]}</h3>
                  <ul>
                    {found.map(({ condition, index }) => {
                      const row = rowOf(condition);
                      const key = `${planet.body}:${index}`;
                      const detail = conditionDetail(condition);
                      return (
                        <li key={index}>
                          <button
                            className="cond-line"
                            aria-expanded={explained === key}
                            onClick={() => setExplained(explained === key ? null : key)}
                          >
                            <Mark rating={condition.rating} colors={colors} />
                            <span>
                              <strong>{row?.label ?? condition.kind}</strong>
                              {detail && <> · {detail}</>}
                            </span>
                          </button>
                          {explained === key && row && (
                            <div className="cond-explain">
                              <p>
                                {condition.rating
                                  ? RATING_NAMES[condition.rating]
                                  : "Fakta uden vurderingsfarve"}
                                .
                              </p>
                              <p>
                                <strong>Regel:</strong> {row.rule}
                              </p>
                              <p className="muted">
                                <strong>Kilde:</strong> {row.source}
                              </p>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </details>
        );
      })}
      <p className="muted legend">
        Kun de syv traditionelle planeter indgår. Der er ingen point eller samlet vurdering; hver
        betingelse står for sig. Tryk på en betingelse for regel og kilde.
      </p>
    </section>
  );
}
