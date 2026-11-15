import { useEffect, useState } from "react";
import { api } from "../api";
import { aspectsForView, lotAspectsForView } from "../aspectFilter";
import {
  BODIES,
  LOTS,
  LOT_NAMES,
  POINT_GLYPHS,
  POINT_NAMES,
  SECT_NAMES,
  birthInputOf,
  countryName,
  formatBirthDate,
  formatOffset,
  type ChartRecord,
  type ComputedChart,
  type Sect,
} from "../astro";
import { AspectTable } from "../components/AspectTable";
import { ChartAnalysisPanel } from "../components/ChartAnalysisPanel";
import { ChartWheel } from "../components/ChartWheel";
import { ConditionPanel } from "../components/ConditionPanel";
import { LifeEventsPanel } from "../components/LifeEventsPanel";
import { LotAspectTable } from "../components/LotAspectTable";
import { LotSymbol, LotsTable } from "../components/LotsTable";
import { PositionsTable } from "../components/PositionsTable";
import { ProfectionPanel } from "../components/ProfectionPanel";
import { useSettings } from "../settings";

type Props = {
  record: ChartRecord;
  onEdit: () => void;
  /** Open the Live Chart at a UTC instant, or now when null. */
  onLive: (at: string | null) => void;
  onDeleted: () => void;
  /** Called after the record itself was changed (e.g. start-screen selection). */
  onChanged: () => void;
};

/** A natal chart: wheel, Planetary Condition, profections, positions, aspect overview and the seven lots. */
export function ChartView({ record, onEdit, onLive, onDeleted, onChanged }: Props) {
  const { settings, update } = useSettings();
  const [computed, setComputed] = useState<ComputedChart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .chartCompute(birthInputOf(record), settings.orbs, {
        sectOverride: record.sectOverride,
        orb: settings.lots.orb,
        exactOrb: settings.lots.exactOrb,
      })
      .then((result) => {
        if (cancelled) return;
        setComputed(result);
        setError(null);
      })
      .catch((reason) => {
        if (!cancelled) setError(String(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [record, settings.orbs, settings.lots.orb, settings.lots.exactOrb]);

  async function setSectOverride(sectOverride: Sect | null) {
    await api.chartSave({ ...record, sectOverride });
    onChanged();
  }

  async function toggleFeatured() {
    await api.chartSave({ ...record, featured: !record.featured });
    onChanged();
  }

  async function remove() {
    if (record.id !== null) await api.chartDelete(record.id);
    onDeleted();
  }

  const place = [record.placeName, countryName(record.countryCode)].filter(Boolean).join(", ");
  const time = computed?.time;

  return (
    <div className="chart-view">
      <header className="chart-header">
        <div>
          <h1>{record.name}</h1>
          <p className="muted">
            {formatBirthDate(record.birthDate)}
            {record.birthTime ? ` kl. ${record.birthTime}` : ""} · {place}
            {time && ` · UTC${formatOffset(time.offsetSeconds)}`}
            {computed && ` · ${SECT_NAMES[computed.lots?.sect ?? computed.chart.sect]}`}
            {computed?.lots?.overridden && " (valgt manuelt)"}
          </p>
          {time?.timeAssumed && (
            <p className="notice">Fødselstidspunktet er ukendt; kl. 12:00 er anvendt.</p>
          )}
          {time?.ambiguous && (
            <p className="notice">
              Klokkeslættet forekom to gange den dag (uret blev stillet tilbage). Det første er
              anvendt.
            </p>
          )}
        </div>
        <div className="actions">
          <label className="check">
            <input type="checkbox" checked={record.featured} onChange={toggleFeatured} />
            Vis på startskærmen
          </label>
          <button className="primary" onClick={() => onLive(null)}>
            Live Chart
          </button>
          <button onClick={onEdit}>Rediger</button>
          {confirmingDelete ? (
            <>
              <button className="danger" onClick={remove}>
                Bekræft sletning
              </button>
              <button onClick={() => setConfirmingDelete(false)}>Fortryd</button>
            </>
          ) : (
            <button onClick={() => setConfirmingDelete(true)}>Slet</button>
          )}
        </div>
      </header>

      {error && <p className="error">Beregningen mislykkedes: {error}</p>}

      {computed && (
        <div className="chart-body">
          <div className="main-column">
            <div className="wheel-column">
              <ChartWheel
                chart={computed.chart}
                aspects={aspectsForView(computed.aspects, settings, "wheel")}
                settings={settings}
                lots={computed.lots?.positions}
              />
            </div>
            <ChartAnalysisPanel record={record} />
            <ConditionPanel record={record} />
            <ProfectionPanel record={record} />
            <LifeEventsPanel record={record} onJump={onLive} jumpLabel="Vis i Live Chart" />
          </div>
          <div className="side-column">
            <section className="panel">
              <h2>Positioner</h2>
              <PositionsTable chart={computed.chart} settings={settings} />
            </section>

            <section className="panel">
              <h2>Aspekter</h2>
              <AspectTable
                aspects={aspectsForView(computed.aspects, settings, "table")}
                settings={settings}
              />
            </section>

            {computed.lots && (
              <section className="panel">
                <h2>Lots</h2>
                <label className="sect-choice">
                  Sect
                  <select
                    aria-label="Sect"
                    value={record.sectOverride ?? ""}
                    onChange={(e) => setSectOverride((e.target.value || null) as Sect | null)}
                  >
                    <option value="">
                      Automatisk ({SECT_NAMES[computed.chart.sect].toLowerCase()} ud fra Solen)
                    </option>
                    <option value="day">Dagkort (valgt manuelt)</option>
                    <option value="night">Natkort (valgt manuelt)</option>
                  </select>
                </label>
                <LotsTable lots={computed.lots.positions} settings={settings} />
                <p className="muted legend">Symbolerne er midlertidige, indtil de endelige er valgt.</p>
              </section>
            )}

            {computed.lots && (
              <section className="panel">
                <h2>Lot-aspekter</h2>
                <LotAspectTable
                  aspects={lotAspectsForView(computed.lots.aspects, settings)}
                  settings={settings}
                />
              </section>
            )}

            <details className="panel">
              <summary>Visning</summary>
              <table className="display-table">
                <thead>
                  <tr>
                    <th></th>
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
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`${POINT_NAMES[body]} i hjulet`}
                          checked={settings.showInWheel[body]}
                          onChange={(e) =>
                            update((s) => ({
                              ...s,
                              showInWheel: { ...s.showInWheel, [body]: e.target.checked },
                            }))
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`${POINT_NAMES[body]} i aspekter`}
                          checked={settings.inAspects[body]}
                          onChange={(e) =>
                            update((s) => ({
                              ...s,
                              inAspects: { ...s.inAspects, [body]: e.target.checked },
                            }))
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <table className="display-table">
                <thead>
                  <tr>
                    <th>Lots</th>
                    <th>
                      <label>
                        <input
                          type="checkbox"
                          aria-label="Alle lots i hjulet"
                          checked={LOTS.every((lot) => settings.lots.showInWheel[lot])}
                          onChange={(e) =>
                            update((s) => ({
                              ...s,
                              lots: {
                                ...s.lots,
                                showInWheel: Object.fromEntries(
                                  LOTS.map((lot) => [lot, e.target.checked]),
                                ) as typeof s.lots.showInWheel,
                              },
                            }))
                          }
                        />{" "}
                        I hjulet
                      </label>
                    </th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {LOTS.map((lot) => (
                    <tr key={lot}>
                      <td>
                        <LotSymbol lot={lot} /> {LOT_NAMES[lot]}
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`${LOT_NAMES[lot]} i hjulet`}
                          checked={settings.lots.showInWheel[lot]}
                          onChange={(e) =>
                            update((s) => ({
                              ...s,
                              lots: {
                                ...s.lots,
                                showInWheel: { ...s.lots.showInWheel, [lot]: e.target.checked },
                              },
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
                    <th>Lot-aspekter til</th>
                    <th>I oversigten</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ["planets", "Planeter og måneknuder"],
                      ["angles", "ASC og MC"],
                      ["lots", "Andre lots"],
                    ] as const
                  ).map(([target, label]) => (
                    <tr key={target}>
                      <td>{label}</td>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Lot-aspekter til ${label}`}
                          checked={settings.lots.aspectsTo[target]}
                          onChange={(e) =>
                            update((s) => ({
                              ...s,
                              lots: {
                                ...s.lots,
                                aspectsTo: { ...s.lots.aspectsTo, [target]: e.target.checked },
                              },
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
                    <th>Aspekter til</th>
                    <th>I hjulet</th>
                    <th>I oversigten</th>
                  </tr>
                </thead>
                <tbody>
                  {(["ascendant", "midheaven"] as const).map((angle) => (
                    <tr key={angle}>
                      <td>{POINT_GLYPHS[angle]}</td>
                      {(["wheel", "table"] as const).map((view) => (
                        <td key={view}>
                          <input
                            type="checkbox"
                            aria-label={`Aspekter til ${POINT_GLYPHS[angle]}, ${view}`}
                            checked={settings.angleAspects[view][angle]}
                            onChange={(e) =>
                              update((s) => ({
                                ...s,
                                angleAspects: {
                                  ...s.angleAspects,
                                  [view]: { ...s.angleAspects[view], [angle]: e.target.checked },
                                },
                              }))
                            }
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </div>
        </div>
      )}
    </div>
  );
}
