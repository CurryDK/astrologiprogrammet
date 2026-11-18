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
 *
 * One line per point, its aspects side by side and wrapping, so the
 * overview uses the width it has and stays low (change specification of
 * 16 November 2026, which leaves the exact arrangement open: a proposal).
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
    <div className="aspect-rows">
      {groups.map((group) => (
        <div className="aspect-row" key={group.point}>
          <span className="aspect-of">{glyph(group.point)}</span>
          <ul>
            {group.aspects.map((aspect) => (
              <li
                key={`${aspect.a}-${aspect.b}`}
                title={`${POINT_NAMES[aspect.a]} ${ASPECT_NAMES[aspect.kind].toLowerCase()} ${POINT_NAMES[aspect.b]}, orb ${formatOrb(aspect.orb)}, ${
                  aspect.applying ? "applicerende" : "separerende"
                }${aspect.outOfSign ? ", out of sign" : ""}`}
              >
                <span className="glyph" style={{ color: settings.colors.aspects[aspect.kind] }}>
                  {ASPECT_GLYPHS[aspect.kind]}
                </span>
                {glyph(aspect.b)}
                <span className="number">{formatOrb(aspect.orb)}</span>
                <span>
                  {aspect.applying ? "a" : "s"}
                  {aspect.outOfSign && <span className="muted"> oos</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
