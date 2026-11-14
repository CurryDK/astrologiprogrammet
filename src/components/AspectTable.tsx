import {
  ASPECT_GLYPHS,
  ASPECT_NAMES,
  POINT_GLYPHS,
  POINT_NAMES,
  formatOrb,
  isBody,
  type Aspect,
  type PointId,
} from "../astro";
import type { Settings } from "../settings";

type Props = {
  /** In the order the core returns them: grouped by first point, Sun first. */
  aspects: Aspect[];
  settings: Settings;
};

/**
 * The aspect overview (specification §5): symbols, orb, "a" for applying or
 * "s" for separating, and "oos" for out-of-sign aspects. Each aspect is
 * listed once, under the point that comes first in the standard order.
 */
export function AspectTable({ aspects, settings }: Props) {
  if (aspects.length === 0) return <p className="muted">Ingen aspekter inden for orb.</p>;

  const groups: { point: PointId; aspects: Aspect[] }[] = [];
  for (const aspect of aspects) {
    const last = groups[groups.length - 1];
    if (last && last.point === aspect.a) last.aspects.push(aspect);
    else groups.push({ point: aspect.a, aspects: [aspect] });
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
    <table className="aspect-table">
      {groups.map((group) => (
        <tbody key={group.point}>
          <tr className="group">
            <th colSpan={6}>{POINT_NAMES[group.point]}</th>
          </tr>
          {group.aspects.map((aspect) => (
            <tr key={`${aspect.a}-${aspect.b}`}>
              <td>{glyph(aspect.a)}</td>
              <td
                className="glyph"
                style={{ color: settings.colors.aspects[aspect.kind] }}
                title={ASPECT_NAMES[aspect.kind]}
              >
                {ASPECT_GLYPHS[aspect.kind]}
              </td>
              <td>{glyph(aspect.b)}</td>
              <td className="number">{formatOrb(aspect.orb)}</td>
              <td title={aspect.applying ? "Applicerende" : "Separerende"}>
                {aspect.applying ? "a" : "s"}
              </td>
              <td className="muted" title={aspect.outOfSign ? "Out of sign" : undefined}>
                {aspect.outOfSign ? "oos" : ""}
              </td>
            </tr>
          ))}
        </tbody>
      ))}
    </table>
  );
}
