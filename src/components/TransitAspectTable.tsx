import { useState } from "react";
import {
  ASPECT_GLYPHS,
  ASPECT_NAMES,
  POINT_GLYPHS,
  POINT_NAMES,
  formatMoment,
  formatOrb,
  isBody,
  type AspectKind,
  type Moment,
  type PointId,
} from "../astro";
import type { Settings } from "../settings";

/**
 * One row: the aspect of a moving point (a transiting or progressed body,
 * or a progressed angle) to a natal point or to another point of its layer.
 */
export type LayerRow = {
  moving: PointId;
  other: PointId;
  kind: AspectKind;
  orb: number;
  applying: boolean;
  outOfSign: boolean;
};

type Props = {
  rows: LayerRow[];
  /** Headings of the two point columns, e.g. "Transit" and "Natal". */
  labels: [string, string];
  settings: Settings;
  /** The shown moment; a pass at exactly this moment is marked. */
  at: string;
  /** The moments the aspect of a row is exact, around the shown moment. */
  findPasses: (row: LayerRow) => Promise<Moment[]>;
  onGoTo: (utc: string) => void;
};

type Passes = { key: string; moments: Moment[] } | { key: string; error: string };

/**
 * An aspect overview of a Live Chart layer. "Eksakt" on a row jumps to the
 * moment the aspect is exact; when retrograde motion makes it exact several
 * times, the passes are listed to choose from (specification §8; decision 8
 * of 15 November 2026 for progressions).
 */
export function TransitAspectTable({ rows, labels, settings, at, findPasses, onGoTo }: Props) {
  const [passes, setPasses] = useState<Passes | null>(null);
  if (rows.length === 0) return <p className="muted">Ingen aspekter inden for orb.</p>;

  const keyOf = (row: LayerRow) => `${row.moving}-${row.kind}-${row.other}`;

  async function findExact(row: LayerRow) {
    const key = keyOf(row);
    try {
      const moments = await findPasses(row);
      setPasses({ key, moments });
      // A single pass needs no choice.
      if (moments.length === 1) onGoTo(moments[0].utc);
    } catch (reason) {
      setPasses({ key, error: String(reason) });
    }
  }

  const glyph = (point: PointId) => (
    <span
      className={isBody(point) ? "glyph" : "angle-label"}
      style={isBody(point) ? { color: settings.colors.bodies[point] } : undefined}
      title={POINT_NAMES[point]}
    >
      {POINT_GLYPHS[point]}
    </span>
  );

  return (
    <table className="aspect-table transit-table">
      <thead>
        <tr>
          <th>{labels[0]}</th>
          <th></th>
          <th>{labels[1]}</th>
          <th>Orb</th>
          <th colSpan={3}></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const key = keyOf(row);
          const open = passes?.key === key ? passes : null;
          return [
            <tr key={key}>
              <td>{glyph(row.moving)}</td>
              <td
                className="glyph"
                style={{ color: settings.colors.aspects[row.kind] }}
                title={ASPECT_NAMES[row.kind]}
              >
                {ASPECT_GLYPHS[row.kind]}
              </td>
              <td>{glyph(row.other)}</td>
              <td className="number">{formatOrb(row.orb)}</td>
              <td title={row.applying ? "Applicerende" : "Separerende"}>
                {row.applying ? "a" : "s"}
              </td>
              <td className="muted" title={row.outOfSign ? "Out of sign" : undefined}>
                {row.outOfSign ? "oos" : ""}
              </td>
              <td>
                <button
                  className="small"
                  onClick={() => findExact(row)}
                  aria-label={`Gå til eksakt ${labels[0]} ${POINT_NAMES[row.moving]} ${ASPECT_NAMES[row.kind]} ${POINT_NAMES[row.other]}`}
                >
                  Eksakt
                </button>
              </td>
            </tr>,
            open && (
              <tr key={`${key}-passes`} className="passes">
                <td colSpan={7}>
                  {"error" in open ? (
                    <span className="error">Kunne ikke beregnes: {open.error}</span>
                  ) : open.moments.length === 0 ? (
                    <span className="muted">
                      Aspektet bliver ikke eksakt i denne omgang; planeten vender om forinden.
                    </span>
                  ) : open.moments.length === 1 ? (
                    <span className="muted">Eksakt {formatMoment(open.moments[0], true)}.</span>
                  ) : (
                    <>
                      <span className="muted">{open.moments.length} passager – vælg:</span>
                      {open.moments.map((moment, index) => (
                        <button
                          key={moment.utc}
                          className={`small${moment.utc === at ? " selected" : ""}`}
                          onClick={() => onGoTo(moment.utc)}
                        >
                          {index + 1}. {formatMoment(moment, true)}
                        </button>
                      ))}
                    </>
                  )}
                </td>
              </tr>
            ),
          ];
        })}
      </tbody>
    </table>
  );
}
