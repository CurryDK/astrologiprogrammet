import {
  LOT_SYMBOLS,
  POINT_GLYPHS,
  SIGNS,
  SIGN_GLYPHS,
  formatDegree,
  lotReading,
  isBody,
  type Aspect,
  type BodyPosition,
  type Chart,
  type LotPosition,
  type PointId,
  type TransitAspect,
} from "../astro";
import type { Settings } from "../settings";
import { aspectLineWidth, normalize, spreadAngles } from "../wheelLayout";

const SIZE = 1000;
const CENTER = SIZE / 2;

/** Radii, from the outside in. */
const R = {
  angleLabel: 420,
  outer: 400,
  signGlyph: 378,
  zodiacInner: 340,
  glyph: 302,
  degree: 267,
  minute: 241,
  retrograde: 224,
  houseOuter: 208,
  houseNumber: 195,
  aspect: 182,
};

/** Radii of the transit layer, outside the zodiac ring. */
const RT = {
  lineEnd: 428,
  glyph: 452,
  reading: 492,
  angleLabel: 528,
};

/** Closest two transit symbols may sit; the outer ring has more room per degree. */
const MIN_TRANSIT_SEPARATION = 7;

/** Closest two symbols may sit, in degrees along the wheel. */
const MIN_GLYPH_SEPARATION = 8.5;
const SYMBOL_FONT = '"Segoe UI Symbol", "Noto Sans Symbols 2", "Noto Sans Symbols", sans-serif';
const INK = "#2a2a2e";
const FAINT = "#d9d5ca";

type Props = {
  chart: Chart;
  /** Aspects to draw as lines; already filtered by the caller. */
  aspects: Aspect[];
  settings: Settings;
  /** The chart's lots; those switched on in the settings are drawn. */
  lots?: LotPosition[];
  /**
   * Live Chart: transiting bodies drawn outside the zodiac ring, with their
   * aspect lines. Everything is already filtered by the caller. This is the
   * simple layered display; the dedicated biwheel design is deferred.
   */
  transit?: {
    positions: BodyPosition[];
    toNatal: TransitAspect[];
    toTransit: Aspect[];
    /** Maximum orb of transit aspects, for the line thickness. */
    orb: number;
  };
};

/**
 * The horoscope wheel (specification §4): whole-sign houses, the Ascendant
 * degree at the left, zodiac running counter-clockwise.
 */
export function ChartWheel({ chart, aspects, settings, lots = [], transit }: Props) {
  const ascendant = chart.angles.ascendant.longitude;

  /** Point on the wheel for a zodiac longitude at a given radius. */
  const at = (longitude: number, radius: number) => {
    const theta = ((180 + longitude - ascendant) * Math.PI) / 180;
    return { x: CENTER + radius * Math.cos(theta), y: CENTER - radius * Math.sin(theta) };
  };
  const line = (longitude: number, from: number, to: number) => {
    const a = at(longitude, from);
    const b = at(longitude, to);
    return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  };

  const shown = chart.positions.filter((p) => settings.showInWheel[p.body]);
  const shownLots = lots.filter((lot) => settings.lots.showInWheel[lot.lot]);
  // Planets and lots share one ring, so they are spread apart together.
  const allAngles = spreadAngles(
    [...shown, ...shownLots].map((p) => p.longitude),
    MIN_GLYPH_SEPARATION,
  );
  const displayAngles = allAngles.slice(0, shown.length);
  const lotAngles = allAngles.slice(shown.length);

  const longitudeOf = (point: PointId): number =>
    isBody(point)
      ? chart.positions.find((p) => p.body === point)!.longitude
      : chart.angles[point].longitude;

  const transitAngles = transit
    ? spreadAngles(
        transit.positions.map((p) => p.longitude),
        MIN_TRANSIT_SEPARATION,
      )
    : [];
  const transitLongitude = (body: PointId) =>
    transit!.positions.find((p) => p.body === body)?.longitude;

  const angles = [
    { label: "ASC", angle: chart.angles.ascendant },
    { label: "DSC", angle: chart.angles.descendant },
    { label: "MC", angle: chart.angles.midheaven },
    { label: "IC", angle: chart.angles.imumCoeli },
  ];

  const ticks = [];
  for (let degree = 0; degree < 360; degree++) {
    if (degree % 30 === 0) continue;
    const length = degree % 10 === 0 ? 13 : degree % 5 === 0 ? 9 : 5;
    ticks.push(
      <line
        key={degree}
        {...line(degree, R.zodiacInner, R.zodiacInner + length)}
        stroke={INK}
        strokeWidth={degree % 5 === 0 ? 1 : 0.6}
      />,
    );
  }

  return (
    <svg
      className="chart-wheel"
      viewBox={transit ? `-175 -95 ${SIZE + 350} ${SIZE + 190}` : `-70 -20 ${SIZE + 140} ${SIZE + 40}`}
      role="img"
      aria-label="Horoskophjul"
    >
      {/* Zodiac ring */}
      <circle cx={CENTER} cy={CENTER} r={R.outer} fill="#fff" stroke={INK} strokeWidth={1.5} />
      <circle cx={CENTER} cy={CENTER} r={R.zodiacInner} fill="#fff" stroke={INK} strokeWidth={1} />
      {ticks}
      {SIGNS.map((sign, index) => {
        const start = index * 30;
        const glyph = at(start + 15, R.signGlyph);
        return (
          <g key={sign}>
            <line {...line(start, R.zodiacInner, R.outer)} stroke={INK} strokeWidth={1} />
            <line {...line(start, R.aspect, R.zodiacInner)} stroke={FAINT} strokeWidth={1} />
            <text
              x={glyph.x}
              y={glyph.y}
              fontFamily={SYMBOL_FONT}
              fontSize={38}
              fill={INK}
              textAnchor="middle"
              dominantBaseline="central"
            >
              {SIGN_GLYPHS[sign]}
            </text>
          </g>
        );
      })}

      {/* Whole-sign house numbers */}
      <circle cx={CENTER} cy={CENTER} r={R.houseOuter} fill="none" stroke={FAINT} />
      <circle cx={CENTER} cy={CENTER} r={R.aspect} fill="none" stroke={INK} strokeWidth={1} />
      {chart.houses.map((house) => {
        const position = at(SIGNS.indexOf(house.sign) * 30 + 15, R.houseNumber);
        return (
          <text
            key={house.number}
            x={position.x}
            y={position.y}
            fontSize={17}
            fill="#77747c"
            textAnchor="middle"
            dominantBaseline="central"
          >
            {house.number}
          </text>
        );
      })}

      {/* Aspect lines, straight between the exact positions */}
      {aspects
        .filter((aspect) => aspect.kind !== "conjunction")
        .map((aspect) => {
          const a = at(longitudeOf(aspect.a), R.aspect);
          const b = at(longitudeOf(aspect.b), R.aspect);
          return (
            <line
              key={`${aspect.a}-${aspect.b}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={settings.colors.aspects[aspect.kind]}
              strokeWidth={aspectLineWidth(aspect.orb, settings.orbs[aspect.kind])}
              // The width is in screen pixels, whatever size the wheel is shown at.
              vectorEffect="non-scaling-stroke"
              strokeLinecap="round"
              // In a Live Chart the natal aspects step back behind the transits.
              opacity={transit ? 0.3 : 1}
            />
          );
        })}

      {/* Transit aspect lines: solid to natal points, dashed among transits */}
      {transit &&
        [
          ...transit.toNatal.map((aspect) => ({
            key: `tn-${aspect.transit}-${aspect.natal}`,
            from: transitLongitude(aspect.transit),
            to: longitudeOf(aspect.natal),
            aspect,
            dashed: false,
          })),
          ...transit.toTransit.map((aspect) => ({
            key: `tt-${aspect.a}-${aspect.b}`,
            from: transitLongitude(aspect.a),
            to: transitLongitude(aspect.b),
            aspect,
            dashed: true,
          })),
        ]
          .filter(
            (item) =>
              item.aspect.kind !== "conjunction" && item.from !== undefined && item.to !== undefined,
          )
          .map((item) => {
            const a = at(item.from!, R.aspect);
            const b = at(item.to!, R.aspect);
            return (
              <line
                key={item.key}
                className={item.dashed ? "transit-transit-line" : "transit-natal-line"}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={settings.colors.aspects[item.aspect.kind]}
                strokeWidth={aspectLineWidth(item.aspect.orb, transit.orb)}
                strokeDasharray={item.dashed ? "7 6" : undefined}
                vectorEffect="non-scaling-stroke"
                strokeLinecap="round"
              />
            );
          })}

      {/* Bodies: symbol, position line to the exact degree, and reading */}
      {shown.map((position, index) => {
        const color = settings.colors.bodies[position.body];
        const display = displayAngles[index];
        const exact = at(position.longitude, R.zodiacInner);
        const lineEnd = at(display, R.glyph + 22);
        const glyph = at(display, R.glyph);
        const degree = at(display, R.degree);
        const minute = at(display, R.minute);
        const retrograde = at(display, R.retrograde);
        const marker = at(position.longitude, R.aspect);
        const text = { fill: color, textAnchor: "middle", dominantBaseline: "central" } as const;
        return (
          <g key={position.body}>
            <line
              x1={exact.x}
              y1={exact.y}
              x2={lineEnd.x}
              y2={lineEnd.y}
              stroke={color}
              strokeWidth={1}
            />
            <circle cx={exact.x} cy={exact.y} r={2.2} fill={color} />
            <circle cx={marker.x} cy={marker.y} r={2.5} fill={color} />
            <text x={glyph.x} y={glyph.y} fontFamily={SYMBOL_FONT} fontSize={40} {...text}>
              {POINT_GLYPHS[position.body]}
            </text>
            <text x={degree.x} y={degree.y} fontSize={21} {...text}>
              {position.degree}°
            </text>
            <text x={minute.x} y={minute.y} fontSize={17} {...text}>
              {String(position.minute).padStart(2, "0")}′
            </text>
            {position.retrograde && (
              <text x={retrograde.x} y={retrograde.y} fontSize={16} fontWeight={600} {...text}>
                R
              </text>
            )}
          </g>
        );
      })}

      {/* Lots: placeholder symbol and a monochrome position line */}
      {shownLots.map((lot, index) => {
        const display = lotAngles[index];
        const exact = at(lot.longitude, R.zodiacInner);
        const lineEnd = at(display, R.glyph + 22);
        const symbol = at(display, R.glyph);
        const degree = at(display, R.degree);
        const minute = at(display, R.minute);
        const text = { fill: INK, textAnchor: "middle", dominantBaseline: "central" } as const;
        // The wheel has room for degrees and minutes only.
        const reading = lotReading(lot, false);
        return (
          <g key={lot.lot} className="wheel-lot">
            <line
              x1={exact.x}
              y1={exact.y}
              x2={lineEnd.x}
              y2={lineEnd.y}
              stroke={INK}
              strokeWidth={1}
            />
            <circle cx={exact.x} cy={exact.y} r={2.2} fill={INK} />
            <circle cx={symbol.x} cy={symbol.y} r={17} fill="#fff" stroke={INK} strokeWidth={1.2} />
            <text x={symbol.x} y={symbol.y} fontSize={18} fontWeight={600} {...text}>
              {LOT_SYMBOLS[lot.lot]}
            </text>
            <text x={degree.x} y={degree.y} fontSize={21} {...text}>
              {reading.degree}°
            </text>
            <text x={minute.x} y={minute.y} fontSize={17} {...text}>
              {String(reading.minute).padStart(2, "0")}′
            </text>
          </g>
        );
      })}

      {/* Transiting bodies, outside the zodiac ring */}
      {transit?.positions.map((position, index) => {
        const color = settings.colors.bodies[position.body];
        const display = transitAngles[index];
        const exact = at(position.longitude, R.outer);
        const lineEnd = at(display, RT.lineEnd);
        const glyph = at(display, RT.glyph);
        const reading = at(display, RT.reading);
        const marker = at(position.longitude, R.aspect);
        const text = { fill: color, textAnchor: "middle", dominantBaseline: "central" } as const;
        return (
          <g key={position.body} className="wheel-transit">
            <line x1={exact.x} y1={exact.y} x2={lineEnd.x} y2={lineEnd.y} stroke={color} strokeWidth={1} />
            <circle cx={exact.x} cy={exact.y} r={2.2} fill={color} />
            <circle cx={marker.x} cy={marker.y} r={3.5} fill="#fff" stroke={color} strokeWidth={1.4} />
            <text x={glyph.x} y={glyph.y} fontFamily={SYMBOL_FONT} fontSize={34} {...text}>
              {POINT_GLYPHS[position.body]}
            </text>
            <text x={reading.x} y={reading.y} fontSize={15} {...text}>
              {formatDegree(position)}
              {position.retrograde ? " R" : ""}
            </text>
          </g>
        );
      })}

      {/* Angles as points on the circle, not as lines through the wheel */}
      {angles.map(({ label, angle }) => {
        const point = at(angle.longitude, R.outer);
        const text = at(angle.longitude, transit ? RT.angleLabel : R.angleLabel);
        const theta = normalize(180 + angle.longitude - ascendant);
        const horizontal = Math.cos((theta * Math.PI) / 180);
        const vertical = Math.sin((theta * Math.PI) / 180);
        const anchor = horizontal > 0.35 ? "start" : horizontal < -0.35 ? "end" : "middle";
        const baseline =
          vertical > 0.35 ? "text-after-edge" : vertical < -0.35 ? "text-before-edge" : "central";
        return (
          <g key={label}>
            <circle cx={point.x} cy={point.y} r={6} fill={INK} />
            <text
              x={text.x}
              y={text.y}
              fontSize={21}
              fontWeight={600}
              fill={INK}
              textAnchor={anchor}
              dominantBaseline={baseline}
            >
              {label} {formatDegree(angle)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
