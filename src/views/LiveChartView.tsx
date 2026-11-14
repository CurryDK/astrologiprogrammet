import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { aspectsForView } from "../aspectFilter";
import {
  BODIES,
  POINT_GLYPHS,
  POINT_NAMES,
  SIGN_GLYPHS,
  SIGN_NAMES,
  birthInputOf,
  formatBirthDate,
  formatDegree,
  formatMoment,
  localZone,
  type ChartRecord,
  type ComputedChart,
  type LiveChart,
  type TimeStep,
} from "../astro";
import { ChartWheel } from "../components/ChartWheel";
import { LifeEventsPanel } from "../components/LifeEventsPanel";
import { TimeNavigator } from "../components/TimeNavigator";
import { TransitAspectTable } from "../components/TransitAspectTable";
import { filterPlanets, transitToNatalForView, transitToTransitForView } from "../liveFilter";
import { useSettings, type Settings } from "../settings";

type Props = {
  record: ChartRecord;
  /** UTC instant to open at; null opens at the present moment. */
  initialAt: string | null;
  onBack: () => void;
};

/**
 * Live Chart (specification §8, §9): the natal chart with the transits of a
 * chosen moment around it. The natal positions stay fixed; the moment is
 * moved by hand. Age and profections follow the shown moment.
 */
export function LiveChartView({ record, initialAt, onBack }: Props) {
  const { settings, update } = useSettings();
  const zone = localZone();
  const [natal, setNatal] = useState<ComputedChart | null>(null);
  const [live, setLive] = useState<LiveChart | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The moment last shown, so a step starts from it even before React re-renders.
  const shownAt = useRef<string | null>(initialAt);
  const busy = useRef(false);

  const { orb } = settings.transits;
  const { yearStart, leapDay } = settings.profections;

  const load = useCallback(
    async (at: string | null, step: TimeStep | null) => {
      // A held arrow fires faster than a slow machine may answer; skip a beat then.
      if (busy.current && step) return;
      busy.current = true;
      try {
        const result = await api.liveChart({
          birth: birthInputOf(record),
          at,
          step,
          zone,
          orb,
          profections: { yearStart, leapDay },
        });
        shownAt.current = result.at.utc;
        setLive(result);
        setError(null);
      } catch (reason) {
        setError(String(reason));
      } finally {
        busy.current = false;
      }
    },
    [record, zone, orb, yearStart, leapDay],
  );

  // First load, and again when the chart or a setting behind the numbers changes.
  useEffect(() => {
    load(shownAt.current, null);
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    api
      .chartCompute(birthInputOf(record), settings.orbs, {
        sectOverride: record.sectOverride,
        orb: settings.lots.orb,
        exactOrb: settings.lots.exactOrb,
      })
      .then((result) => {
        if (!cancelled) setNatal(result);
      })
      .catch((reason) => {
        if (!cancelled) setError(String(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [record, settings.orbs, settings.lots.orb, settings.lots.exactOrb]);

  const goTo = (utc: string) => load(utc, null);
  const setTransits = (change: (t: Settings["transits"]) => Settings["transits"]) =>
    update((s) => ({ ...s, transits: change(s.transits) }));

  const planets =
    live && natal
      ? filterPlanets(
          settings.transits.filters,
          live.profection,
          live.profectionMonth,
          natal.chart.positions,
          live.positions,
        )
      : null;
  const month = live?.profection?.months.find((m) => m.number === live.profectionMonth) ?? null;
  const { groups, filters } = settings.transits;

  return (
    <div className="chart-view live-chart">
      <header className="chart-header">
        <div>
          <h1>Live Chart · {record.name}</h1>
          <p className="muted">
            Født {formatBirthDate(record.birthDate)}
            {record.birthTime ? ` kl. ${record.birthTime}` : " (fødselstid ukendt, kl. 12:00 anvendt)"}
            {" · "}natalpositionerne står fast, transitterne flyttes
          </p>
        </div>
        <div className="actions">
          <button onClick={onBack}>Tilbage til horoskopet</button>
        </div>
      </header>

      {error && <p className="error">Beregningen mislykkedes: {error}</p>}

      {live && (
        <section className="panel time-panel">
          <TimeNavigator
            at={live.at}
            zone={zone}
            unit={settings.transits.stepUnit}
            onUnit={(stepUnit) => setTransits((t) => ({ ...t, stepUnit }))}
            onStep={(direction) =>
              load(shownAt.current, { unit: settings.transits.stepUnit, count: direction })
            }
            onNow={() => load(null, null)}
            onGoTo={goTo}
          />
          <div className="live-profection">
            {live.age === null || !live.profection ? (
              <span className="muted">Tidspunktet ligger før fødslen; ingen alder eller profektion.</span>
            ) : (
              <>
                <span>
                  <strong>Alder {live.age}</strong>
                </span>
                <span>
                  Årets Time Lord:{" "}
                  <span
                    className="glyph-inline"
                    style={{ color: settings.colors.bodies[live.profection.timeLord] }}
                  >
                    {POINT_GLYPHS[live.profection.timeLord]}
                  </span>{" "}
                  <strong>{POINT_NAMES[live.profection.timeLord]}</strong>{" "}
                  <span className="muted">
                    ({live.profection.house}. hus,{" "}
                    <span className="glyph-inline">{SIGN_GLYPHS[live.profection.sign]}</span>{" "}
                    {SIGN_NAMES[live.profection.sign]})
                  </span>
                </span>
                {month && (
                  <span>
                    Måned {month.number}:{" "}
                    <span className="glyph-inline" style={{ color: settings.colors.bodies[month.ruler] }}>
                      {POINT_GLYPHS[month.ruler]}
                    </span>{" "}
                    {POINT_NAMES[month.ruler]}{" "}
                    <span className="muted">
                      ({month.house}. hus, <span className="glyph-inline">{SIGN_GLYPHS[month.sign]}</span>{" "}
                      {SIGN_NAMES[month.sign]}, til {formatMoment(month.end, false)})
                    </span>
                  </span>
                )}
              </>
            )}
          </div>
        </section>
      )}

      {live && natal && (
        <div className="chart-body">
          <div className="main-column">
            <div className="wheel-column">
              <ChartWheel
                chart={natal.chart}
                aspects={groups.natal ? aspectsForView(natal.aspects, settings, "wheel") : []}
                settings={settings}
                lots={natal.lots?.positions}
                transit={{
                  positions: live.positions.filter((p) => settings.transits.showInWheel[p.body]),
                  toNatal: transitToNatalForView(live.toNatal, settings, "wheel", planets),
                  toTransit: transitToTransitForView(live.toTransit, settings, "wheel", planets),
                  orb,
                }}
              />
              <p className="muted legend wheel-legend">
                Inderst natalhoroskopet, yderst transitterne. Fuldt optrukne linjer: transit →
                natal. Stiplede: transit → transit. Svage: natale aspekter.
              </p>
            </div>
            <LifeEventsPanel record={record} onJump={goTo} jumpLabel="Gå til" />
          </div>

          <div className="side-column">
            <details className="panel" open>
              <summary>Visning</summary>
              <table className="display-table">
                <thead>
                  <tr>
                    <th>Aspektgrupper</th>
                    <th>Vis</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ["toNatal", "Transit → natal"],
                      ["toTransit", "Transit → transit"],
                      ["natal", "Natale aspekter (i hjulet)"],
                    ] as const
                  ).map(([group, label]) => (
                    <tr key={group}>
                      <td>{label}</td>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={label}
                          checked={groups[group]}
                          onChange={(e) =>
                            setTransits((t) => ({
                              ...t,
                              groups: { ...t.groups, [group]: e.target.checked },
                            }))
                          }
                        />
                      </td>
                      <td></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <table className="display-table">
                <thead>
                  <tr>
                    <th>Vis kun transitaspekter med</th>
                    <th>Filter</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ["yearLord", "Årets Time Lord"],
                      ["monthLord", "Månedens Time Lord"],
                      ["profectionSign", "Planeter i årets profektionstegn"],
                    ] as const
                  ).map(([filter, label]) => (
                    <tr key={filter}>
                      <td>{label}</td>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Filter: ${label}`}
                          checked={filters[filter]}
                          onChange={(e) =>
                            setTransits((t) => ({
                              ...t,
                              filters: { ...t.filters, [filter]: e.target.checked },
                            }))
                          }
                        />
                      </td>
                      <td></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted legend">
                Filtrene kan kombineres: et aspekt vises, når en af de valgte planeter indgår, som
                transitplanet eller som natalplanet. Uden filtre vises alle.
              </p>
              <table className="display-table">
                <thead>
                  <tr>
                    <th>Transitplaneter</th>
                    <th>I hjulet</th>
                    <th>Aspekter</th>
                  </tr>
                </thead>
                <tbody>
                  {BODIES.map((body) => (
                    <tr key={body}>
                      <td>
                        <span className="glyph" style={{ color: settings.colors.bodies[body] }}>
                          {POINT_GLYPHS[body]}
                        </span>{" "}
                        {POINT_NAMES[body]}
                      </td>
                      {(["showInWheel", "inAspects"] as const).map((choice) => (
                        <td key={choice}>
                          <input
                            type="checkbox"
                            aria-label={`Transit ${POINT_NAMES[body]} ${
                              choice === "showInWheel" ? "i hjulet" : "i aspekter"
                            }`}
                            checked={settings.transits[choice][body]}
                            onChange={(e) =>
                              setTransits((t) => ({
                                ...t,
                                [choice]: { ...t[choice], [body]: e.target.checked },
                              }))
                            }
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted legend">
                Natalplaneternes synlighed og aspekter vælges under “Visning” ved horoskopet. Orb for
                transitaspekter ({orb}°) ændres under Indstillinger.
              </p>
            </details>

            {groups.toNatal && (
              <section className="panel">
                <h2>Transit → natal</h2>
                <TransitAspectTable
                  rows={transitToNatalForView(live.toNatal, settings, "table", planets).map((a) => ({
                    ...a,
                    other: a.natal,
                  }))}
                  target="natal"
                  settings={settings}
                  birth={birthInputOf(record)}
                  at={live.at.utc}
                  zone={zone}
                  onGoTo={goTo}
                />
              </section>
            )}

            {groups.toTransit && (
              <section className="panel">
                <h2>Transit → transit</h2>
                <TransitAspectTable
                  rows={transitToTransitForView(live.toTransit, settings, "table", planets).map(
                    (a) => ({ ...a, transit: a.a as (typeof BODIES)[number], other: a.b }),
                  )}
                  target="transit"
                  settings={settings}
                  birth={birthInputOf(record)}
                  at={live.at.utc}
                  zone={zone}
                  onGoTo={goTo}
                />
              </section>
            )}

            <section className="panel">
              <h2>Transitpositioner</h2>
              <table className="positions-table">
                <thead>
                  <tr>
                    <th colSpan={2}></th>
                    <th colSpan={3}>Position</th>
                    <th></th>
                    <th title="Natalhoroskopets hus">Natalhus</th>
                  </tr>
                </thead>
                <tbody>
                  {live.positions.map((p) => (
                    <tr key={p.body}>
                      <td className="glyph" style={{ color: settings.colors.bodies[p.body] }}>
                        {POINT_GLYPHS[p.body]}
                      </td>
                      <td>{POINT_NAMES[p.body]}</td>
                      <td className="number">{formatDegree(p)}</td>
                      <td className="glyph">{SIGN_GLYPHS[p.sign]}</td>
                      <td>{SIGN_NAMES[p.sign]}</td>
                      <td className="retro" title={p.retrograde ? "Retrograd" : undefined}>
                        {p.retrograde ? "R" : ""}
                      </td>
                      <td className="number">{p.house}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
