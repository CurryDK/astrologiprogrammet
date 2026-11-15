import {
  LOT_NAMES,
  POINT_GLYPHS,
  POINT_NAMES,
  SIGN_GLYPHS,
  SIGN_NAMES,
  formatLot,
  type LotPosition,
} from "../astro";
import type { Settings } from "../settings";
import { LotSymbol } from "./LotSymbol";

export { LotSymbol };

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
            <td className="number">{formatLot(lot, settings.lots.showSeconds)}</td>
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
