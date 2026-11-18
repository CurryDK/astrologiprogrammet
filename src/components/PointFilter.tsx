import {
  ASPECT_GLYPHS,
  ASPECT_KINDS,
  ASPECT_NAMES,
  POINTS,
  POINT_GLYPHS,
  POINT_NAMES,
  isBody,
  type Body,
  type PointId,
} from "../astro";
import type { PointChoice } from "../eventText";
import type { Settings } from "../settings";

type Props = {
  choice: PointChoice;
  onChange: (choice: PointChoice) => void;
  settings: Settings;
  /** Leave out the aspect kinds (a search for events without aspects). */
  withoutKinds?: boolean;
};

const toggled = <T,>(list: T[], item: T, on: boolean): T[] =>
  on ? (list.includes(item) ? list : [...list, item]) : list.filter((other) => other !== item);

/**
 * The objects of a search or report: which transiting bodies, progressed
 * points and natal points take part, and which aspect kinds.
 */
export function PointFilter({ choice, onChange, settings, withoutKinds = false }: Props) {
  const box = (label: string, checked: boolean, change: (on: boolean) => void) => (
    <input type="checkbox" aria-label={label} checked={checked} onChange={(e) => change(e.target.checked)} />
  );
  return (
    <div className="point-filter">
      <table className="display-table">
        <thead>
          <tr>
            <th></th>
            <th>Transit</th>
            <th>Progression</th>
            <th>Natal</th>
          </tr>
        </thead>
        <tbody>
          {POINTS.map((point: PointId) => (
            <tr key={point}>
              <td>
                {isBody(point) ? (
                  <>
                    <span className="glyph" style={{ color: settings.colors.bodies[point] }}>
                      {POINT_GLYPHS[point]}
                    </span>{" "}
                    {POINT_NAMES[point]}
                  </>
                ) : (
                  POINT_GLYPHS[point]
                )}
              </td>
              <td>
                {isBody(point) &&
                  box(`Transit ${POINT_NAMES[point]}`, choice.transitBodies.includes(point), (on) =>
                    onChange({ ...choice, transitBodies: toggled<Body>(choice.transitBodies, point, on) }),
                  )}
              </td>
              <td>
                {box(`Progressiv ${POINT_NAMES[point]}`, choice.progressedPoints.includes(point), (on) =>
                  onChange({ ...choice, progressedPoints: toggled(choice.progressedPoints, point, on) }),
                )}
              </td>
              <td>
                {box(`Natal ${POINT_NAMES[point]}`, choice.natalPoints.includes(point), (on) =>
                  onChange({ ...choice, natalPoints: toggled(choice.natalPoints, point, on) }),
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!withoutKinds && (
        <div className="kind-filter">
          {ASPECT_KINDS.map((kind) => (
            <label key={kind} className="check">
              {box(ASPECT_NAMES[kind], choice.kinds.includes(kind), (on) =>
                onChange({ ...choice, kinds: toggled(choice.kinds, kind, on) }),
              )}
              <span className="glyph-inline" style={{ color: settings.colors.aspects[kind] }}>
                {ASPECT_GLYPHS[kind]}
              </span>{" "}
              {ASPECT_NAMES[kind]}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
