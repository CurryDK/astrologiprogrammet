import { LOT_NAMES, LOT_SYMBOL_PLANETS, POINT_GLYPHS, type Lot } from "../astro";

export const SYMBOL_FONT =
  '"Astro Glyphs", "Segoe UI Symbol", "Noto Sans Symbols 2", "Noto Sans Symbols", sans-serif';

/**
 * The symbol of a lot as SVG, centred on (x, y) and `size` across (visual
 * wheel specification of 15 November 2026, section 5): Fortune is a circle
 * with a diagonal cross, Spirit a circle with a plus, and the other five a
 * thin circle around the glyph of their planet.
 */
export function LotGlyph({
  lot,
  x,
  y,
  size,
  color,
}: {
  lot: Lot;
  x: number;
  y: number;
  size: number;
  color: string;
}) {
  const radius = size / 2 - 0.6;
  const stroke = Math.max(1, size / 19);
  const planet = LOT_SYMBOL_PLANETS[lot];
  const reach = lot === "fortune" ? radius * Math.SQRT1_2 : radius;
  return (
    <g>
      <circle cx={x} cy={y} r={radius} fill="#fff" stroke={color} strokeWidth={stroke} />
      {planet ? (
        <text
          x={x}
          y={y}
          fontFamily={SYMBOL_FONT}
          fontSize={size * 0.64}
          fill={color}
          textAnchor="middle"
          dominantBaseline="central"
        >
          {POINT_GLYPHS[planet]}
        </text>
      ) : lot === "fortune" ? (
        <>
          <line x1={x - reach} y1={y - reach} x2={x + reach} y2={y + reach} stroke={color} strokeWidth={stroke} />
          <line x1={x - reach} y1={y + reach} x2={x + reach} y2={y - reach} stroke={color} strokeWidth={stroke} />
        </>
      ) : (
        <>
          <line x1={x - reach} y1={y} x2={x + reach} y2={y} stroke={color} strokeWidth={stroke} />
          <line x1={x} y1={y - reach} x2={x} y2={y + reach} stroke={color} strokeWidth={stroke} />
        </>
      )}
    </g>
  );
}

/** A lot's symbol for use in running text and tables. */
export function LotSymbol({ lot }: { lot: Lot }) {
  return (
    <svg className="lot-symbol" viewBox="0 0 24 24" role="img" aria-label={LOT_NAMES[lot]}>
      <title>{LOT_NAMES[lot]}</title>
      <LotGlyph lot={lot} x={12} y={12} size={23} color="currentColor" />
    </svg>
  );
}
