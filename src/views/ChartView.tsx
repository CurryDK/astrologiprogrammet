import { useEffect, useState } from "react";
import { api } from "../api";
import { aspectsForView } from "../aspectFilter";
import {
  BODIES,
  POINT_GLYPHS,
  POINT_NAMES,
  birthInputOf,
  countryName,
  formatBirthDate,
  formatOffset,
  type ChartRecord,
  type ComputedChart,
} from "../astro";
import { AspectTable } from "../components/AspectTable";
import { ChartWheel } from "../components/ChartWheel";
import { PositionsTable } from "../components/PositionsTable";
import { useSettings } from "../settings";

type Props = {
  record: ChartRecord;
  onEdit: () => void;
  onDeleted: () => void;
  /** Called after the record itself was changed (e.g. start-screen selection). */
  onChanged: () => void;
};

/** A natal chart: wheel, positions and aspect overview. */
export function ChartView({ record, onEdit, onDeleted, onChanged }: Props) {
  const { settings, update } = useSettings();
  const [computed, setComputed] = useState<ComputedChart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .chartCompute(birthInputOf(record), settings.orbs)
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
  }, [record, settings.orbs]);

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
            {computed && ` · ${computed.chart.sect === "day" ? "Dagkort" : "Natkort"}`}
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
          <div className="wheel-column">
            <ChartWheel
              chart={computed.chart}
              aspects={aspectsForView(computed.aspects, settings, "wheel")}
              settings={settings}
            />
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
