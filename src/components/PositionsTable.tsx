import {
  POINT_GLYPHS,
  POINT_NAMES,
  SIGN_GLYPHS,
  SIGN_NAMES,
  formatDegree,
  type Angle,
  type Chart,
} from "../astro";
import type { Settings } from "../settings";

type Props = {
  chart: Chart;
  settings: Settings;
  /** Leave out angles and houses, which depend on the place (used for "the sky now"). */
  positionsOnly?: boolean;
};

/** Positions with sign, degree and minute, retrograde status and whole-sign house. */
export function PositionsTable({ chart, settings, positionsOnly = false }: Props) {
  const angleRow = (label: string, name: string, angle: Angle) => (
    <tr key={label}>
      <td className="angle-label">{label}</td>
      <td>{name}</td>
      <td className="number">{formatDegree(angle)}</td>
      <td className="glyph">{SIGN_GLYPHS[angle.sign]}</td>
      <td>{SIGN_NAMES[angle.sign]}</td>
      <td></td>
      <td className="number">{angle.house}</td>
    </tr>
  );

  return (
    <table className="positions-table">
      <thead>
        <tr>
          <th colSpan={2}></th>
          <th colSpan={3}>Position</th>
          <th></th>
          {!positionsOnly && <th>Hus</th>}
        </tr>
      </thead>
      <tbody>
        {chart.positions.map((p) => (
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
            {!positionsOnly && <td className="number">{p.house}</td>}
          </tr>
        ))}
      </tbody>
      {!positionsOnly && (
        <tbody className="angles">
          {angleRow("ASC", "Ascendant", chart.angles.ascendant)}
          {angleRow("DSC", "Descendant", chart.angles.descendant)}
          {angleRow("MC", "Medium Coeli", chart.angles.midheaven)}
          {angleRow("IC", "Imum Coeli", chart.angles.imumCoeli)}
        </tbody>
      )}
    </table>
  );
}
