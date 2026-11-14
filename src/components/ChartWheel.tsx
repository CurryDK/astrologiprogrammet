import {
  POINT_GLYPHS,
  SIGNS,
  SIGN_GLYPHS,
  formatDegree,
  isBody,
  type Aspect,
  type Chart,
  type PointId,
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
};

/**
 * The horoscope wheel (specification §4): whole-sign houses, the Ascendant
 * degree at the left, zodiac running counter-clockwise.
 */
export function ChartWheel({ chart, aspects, settings }: Props) {
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
  const displayAngles = spreadAngles(
    shown.map((p) => p.longitude),
    MIN_GLYPH_SEPARATION,
  );

  const longitudeOf = (point: PointId): number =>
    isBody(point)
      ? chart.positions.find((p) => p.body === point)!.longitude
      : chart.angles[point].longitude;

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
      viewBox={`-70 -20 ${SIZE + 140} ${SIZE + 40}`}
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
              strokeWidth={aspectLineWidth(aspect.orb)}
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

      {/* Angles as points on the circle, not as lines through the wheel */}
      {angles.map(({ label, angle }) => {
        const point = at(angle.longitude, R.outer);
        const text = at(angle.longitude, R.angleLabel);
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
