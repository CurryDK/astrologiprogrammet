import {
  LOT_NAMES,
  LOT_SYMBOLS,
  POINT_GLYPHS,
  POINT_NAMES,
  SIGN_GLYPHS,
  SIGN_NAMES,
  formatDegree,
  type Lot,
  type LotPosition,
} from "../astro";
import type { Settings } from "../settings";

/** A lot's symbol. A placeholder until the real symbols are chosen. */
export function LotSymbol({ lot }: { lot: Lot }) {
  return (
    <span className="lot-symbol" title={LOT_NAMES[lot]}>
      {LOT_SYMBOLS[lot]}
    </span>
  );
}

type Props = {
  lots: LotPosition[];
  settings: Settings;
};

/**
 * The lots overview (specification §10): position, traditional planet, sign
 * ruler, and the ruler's sign and whole-sign house. Facts only.
 */
export function LotsTable({ lots, settings }: Props) {
  const planet = (body: LotPosition["planet"]) => (
    <span className="glyph" style={{ color: settings.colors.bodies[body] }} title={POINT_NAMES[body]}>
      {POINT_GLYPHS[body]}
    </span>
  );

  return (
    <table className="lots-table">
      <thead>
        <tr>
          <th colSpan={2}>Lot</th>
          <th colSpan={2}>Position</th>
          <th>Hus</th>
          <th>Planet</th>
          <th colSpan={3}>Tegnhersker i</th>
        </tr>
      </thead>
      <tbody>
        {lots.map((lot) => (
          <tr key={lot.lot}>
            <td>
              <LotSymbol lot={lot.lot} />
            </td>
            <td>{LOT_NAMES[lot.lot]}</td>
            <td className="number">{formatDegree(lot)}</td>
            <td className="glyph" title={SIGN_NAMES[lot.sign]}>
              {SIGN_GLYPHS[lot.sign]}
            </td>
            <td className="number">{lot.house}</td>
            <td className="center">{planet(lot.planet)}</td>
            <td className="center">{planet(lot.ruler)}</td>
            <td className="glyph" title={SIGN_NAMES[lot.rulerSign]}>
              {SIGN_GLYPHS[lot.rulerSign]}
            </td>
            <td className="number" title={`${POINT_NAMES[lot.ruler]} i hus ${lot.rulerHouse}`}>
              hus {lot.rulerHouse}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
