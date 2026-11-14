import { useState } from "react";
import { api } from "../api";
import {
  ASPECT_GLYPHS,
  ASPECT_NAMES,
  POINT_GLYPHS,
  POINT_NAMES,
  formatMoment,
  formatOrb,
  isBody,
  type AspectKind,
  type BirthInput,
  type Body,
  type Moment,
  type PassOther,
  type PointId,
} from "../astro";
import type { Settings } from "../settings";

/** One row: a transiting body's aspect to a natal point or to another transiting body. */
export type TransitRow = {
  transit: Body;
  other: PointId;
  kind: AspectKind;
  orb: number;
  applying: boolean;
  outOfSign: boolean;
};

type Props = {
  rows: TransitRow[];
  /** What the second column is: natal points or transiting bodies. */
  target: "natal" | "transit";
  settings: Settings;
  birth: BirthInput;
  /** The shown moment, from which the exact passes are searched. */
  at: string;
  zone: string;
  onGoTo: (utc: string) => void;
};

type Passes = { key: string; moments: Moment[] } | { key: string; error: string };

/**
 * A transit aspect overview. "Eksakt" on a row jumps to the moment the
 * aspect is exact; when retrograde motion makes it exact several times, the
 * passes are listed to choose from (specification §8).
 */
export function TransitAspectTable({ rows, target, settings, birth, at, zone, onGoTo }: Props) {
  const [passes, setPasses] = useState<Passes | null>(null);
  if (rows.length === 0) return <p className="muted">Ingen aspekter inden for orb.</p>;

  const keyOf = (row: TransitRow) => `${row.transit}-${row.kind}-${row.other}`;

  async function findExact(row: TransitRow) {
    const key = keyOf(row);
    const other: PassOther =
      target === "natal" ? { natal: row.other } : { transit: row.other as Body };
    try {
      const moments = await api.transitPasses({
        birth,
        transit: row.transit,
        other,
        kind: row.kind,
        at,
        zone,
      });
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
          <th>Transit</th>
          <th></th>
          <th>{target === "natal" ? "Natal" : "Transit"}</th>
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
              <td>{glyph(row.transit)}</td>
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
                  aria-label={`Gå til eksakt ${POINT_NAMES[row.transit]} ${ASPECT_NAMES[row.kind]} ${POINT_NAMES[row.other]}`}
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
