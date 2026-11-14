import {
  ASPECT_GLYPHS,
  ASPECT_NAMES,
  LOT_NAMES,
  POINT_GLYPHS,
  POINT_NAMES,
  formatOrb,
  isBody,
  isLot,
  type Lot,
  type LotAspect,
} from "../astro";
import type { Settings } from "../settings";
import { LotSymbol } from "./LotsTable";

type Props = {
  /** In the order the core returns them: grouped by lot, Fortune first. */
  aspects: LotAspect[];
  settings: Settings;
};

/**
 * The lot aspect overview (specification §10), separate from the planet
 * aspects: orb, "e" for exact and "oos" for out of sign. Lots do not move,
 * so there is no applying or separating.
 */
export function LotAspectTable({ aspects, settings }: Props) {
  const legend = (
    <p className="muted legend">
      Orb {formatOrb(settings.lots.orb)} · e = eksakt (orb under {formatOrb(settings.lots.exactOrb)}
      ) · oos = out of sign
    </p>
  );
  if (aspects.length === 0) {
    return (
      <>
        <p className="muted">Ingen lot-aspekter inden for orb.</p>
        {legend}
      </>
    );
  }

  const groups: { lot: Lot; aspects: LotAspect[] }[] = [];
  for (const aspect of aspects) {
    const last = groups[groups.length - 1];
    if (last && last.lot === aspect.lot) last.aspects.push(aspect);
    else groups.push({ lot: aspect.lot, aspects: [aspect] });
  }

  const other = (point: LotAspect["other"]) => {
    if (isLot(point)) return <LotSymbol lot={point} />;
    return (
      <span
        className={isBody(point) ? "glyph" : "angle-label"}
        style={isBody(point) ? { color: settings.colors.bodies[point] } : undefined}
        title={POINT_NAMES[point]}
      >
        {POINT_GLYPHS[point]}
      </span>
    );
  };

  return (
    <>
      <table className="aspect-table">
        {groups.map((group) => (
          <tbody key={group.lot}>
            <tr className="group">
              <th colSpan={6}>{LOT_NAMES[group.lot]}</th>
            </tr>
            {group.aspects.map((aspect) => (
              <tr key={`${aspect.lot}-${aspect.other}`}>
                <td>
                  <LotSymbol lot={aspect.lot} />
                </td>
                <td
                  className="glyph"
                  style={{ color: settings.colors.aspects[aspect.kind] }}
                  title={ASPECT_NAMES[aspect.kind]}
                >
                  {ASPECT_GLYPHS[aspect.kind]}
                </td>
                <td>{other(aspect.other)}</td>
                <td className="number">{formatOrb(aspect.orb)}</td>
                <td title={aspect.exact ? "Eksakt" : undefined}>{aspect.exact ? "e" : ""}</td>
                <td className="muted" title={aspect.outOfSign ? "Out of sign" : undefined}>
                  {aspect.outOfSign ? "oos" : ""}
                </td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
      {legend}
    </>
  );
}
