import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import {
  POINT_GLYPHS,
  POINT_NAMES,
  SIGNS,
  SIGN_GLYPHS,
  elementOf,
  formatDegree,
  lotReading,
  isBody,
  type Aspect,
  type BodyPosition,
  type Chart,
  type LotPosition,
  type PointId,
  type RingSegment,
  type TransitAspect,
  type WheelRings,
} from "../astro";
import type { Settings } from "../settings";
import {
  aspectLineWidth,
  boxReach,
  labelSeparation,
  normalize,
  spreadAngles,
  spreadAnglesBy,
} from "../wheelLayout";
import { LotGlyph, SYMBOL_FONT } from "./LotSymbol";

// Everything is measured in screen pixels. Text and symbols keep their size
// when the window changes; only the wheel's radius follows the room there is
// (visual wheel specification of 15 November 2026, section 3).

/** Verdana for text and numbers: provisional, to be judged in the wheel. */
const TEXT_FONT = 'Verdana, "DejaVu Sans", sans-serif';
const INK = "#2a2a2e";
const RING_LINE = "#8a8790";
const FAINT = "#cfcbc2";

/** Width of the zodiac ring and of each information ring. */
const ZODIAC_WIDTH = 40;
const RING_WIDTH = 18;
/** Degree scale: a short tick per degree, a longer one every fifth. */
const TICK = 4;
const TICK_FIVE = 8;

/** An upright planet label: symbol, degrees, minutes and, when retrograde, Rx. */
const LABEL = { width: 27, glyph: 24, line: 14, rx: 11, gap: 6 };
const labelHeight = (retrograde: boolean) =>
  LABEL.glyph + 2 * LABEL.line + (retrograde ? LABEL.rx : 0);
/** From the degree scale in to the circle the aspect lines run between. */
const ASPECT_INSET = TICK_FIVE + LABEL.gap + labelHeight(true) + 7;

/** Room outside the wheel for the angle labels; more with a transit layer. */
const MARGIN = { x: 100, y: 34 };
const MARGIN_TRANSIT = { x: 172, y: 100 };
/** The transit layer, in pixels outside the zodiac ring. */
const TRANSIT = { lineEnd: 17, glyph: 31, reading: 55, angleLabel: 78 };
/** Closest two transit symbols may sit, in degrees along the wheel. */
const MIN_TRANSIT_SEPARATION = 7;

/**
 * Smallest radius at which the wheel is still readable with every ring
 * shown. Provisional: the specification leaves the figure to testing.
 */
const MIN_RADIUS = 270;
const MAX_RADIUS = 440;

type Props = {
  chart: Chart;
  /** Aspects to draw as lines; already filtered by the caller. */
  aspects: Aspect[];
  settings: Settings;
  /** The chart's lots; those switched on in the settings are drawn. */
  lots?: LotPosition[];
  /** Largest radius of the wheel in pixels, where the screen gives it less room. */
  maxRadius?: number;
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

let ringsRequest: Promise<WheelRings> | null = null;

/** The decan and bounds tables; fetched once, the same for every chart. */
function useWheelRings(): WheelRings | null {
  const [rings, setRings] = useState<WheelRings | null>(null);
  useEffect(() => {
    let live = true;
    (ringsRequest ??= api.wheelRings())
      .then((value) => {
        if (live) setRings(value);
      })
      .catch((error) => {
        ringsRequest = null;
        console.error(error);
      });
    return () => {
      live = false;
    };
  }, []);
  return rings;
}

/** Width of the element the wheel sits in, and the height of the window. */
function useRoom() {
  const box = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState({ width: 760, height: 900, wide: true });
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const measure = () =>
      setRoom({
        width: element.clientWidth,
        height: window.innerHeight,
        wide: window.innerWidth > 1000,
      });
    measure();
    window.addEventListener("resize", measure);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(element);
    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, []);
  return { box, room };
}

/**
 * The horoscope wheel (specification §4 and the visual wheel specification
 * of 15 November 2026): whole-sign houses, the Ascendant degree at the left,
 * zodiac running counter-clockwise.
 */
export function ChartWheel({ chart, aspects, settings, lots = [], maxRadius, transit }: Props) {
  const { box, room } = useRoom();
  const tables = useWheelRings();
  const ascendant = chart.angles.ascendant.longitude;

  const margin = transit ? MARGIN_TRANSIT : MARGIN;
  // Beside the side column the whole wheel should fit in the window's height.
  const byHeight = room.wide ? (room.height - 190) / 2 - margin.y : Infinity;
  const outer = Math.round(
    Math.max(
      MIN_RADIUS,
      Math.min(room.width / 2 - margin.x, byHeight, maxRadius ?? MAX_RADIUS, MAX_RADIUS),
    ),
  );
  const center = { x: outer + margin.x, y: outer + margin.y };

  // The information rings, from the zodiac ring inwards. A hidden ring
  // leaves no gap: the rings inside it and the degree scale move out.
  const zodiacInner = outer - ZODIAC_WIDTH;
  const ringChoices: { key: string; name: string; show: boolean; segments?: RingSegment[] }[] = [
    {
      key: "chaldean",
      name: "Kaldæiske decaner",
      show: settings.wheel.rings.chaldeanDecans,
      segments: tables?.chaldeanDecans,
    },
    {
      key: "modern",
      name: "Moderne decaner",
      show: settings.wheel.rings.modernDecans,
      segments:
        settings.wheel.modernDecanRulers === "modern"
          ? tables?.modernDecans
          : tables?.modernDecansTraditional,
    },
    {
      key: "bounds",
      name: "Egyptiske bounds",
      show: settings.wheel.rings.bounds,
      segments: tables?.bounds,
    },
  ];
  const rings = ringChoices
    .filter((ring) => ring.show)
    .map((ring, index) => ({ ...ring, outer: zodiacInner - index * RING_WIDTH }));
  /** The degree scale hangs from the innermost ring. */
  const scale = zodiacInner - rings.length * RING_WIDTH;
  const aspectRadius = scale - ASPECT_INSET;
  const houseNumberRadius = Math.min(46, aspectRadius * 0.45);

  /** Screen angle of a zodiac longitude, in degrees counter-clockwise from the right. */
  const screenAngle = (longitude: number) => 180 + longitude - ascendant;
  /** Point on the wheel for a zodiac longitude at a given radius. */
  const at = (longitude: number, radius: number) => {
    const theta = (screenAngle(longitude) * Math.PI) / 180;
    return { x: center.x + radius * Math.cos(theta), y: center.y - radius * Math.sin(theta) };
  };
  const line = (longitude: number, from: number, to: number) => {
    const a = at(longitude, from);
    const b = at(longitude, to);
    return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  };
  /** A piece of a ring between two longitudes. */
  const sector = (from: number, to: number, outerRadius: number, innerRadius: number) => {
    const a = at(from, outerRadius);
    const b = at(to, outerRadius);
    const c = at(to, innerRadius);
    const d = at(from, innerRadius);
    return (
      `M${a.x} ${a.y} A${outerRadius} ${outerRadius} 0 0 0 ${b.x} ${b.y} ` +
      `L${c.x} ${c.y} A${innerRadius} ${innerRadius} 0 0 1 ${d.x} ${d.y} Z`
    );
  };

  const shown = chart.positions.filter((p) => settings.showInWheel[p.body]);
  const shownLots = lots.filter((lot) => settings.lots.showInWheel[lot.lot]);
  // Planets and lots share one band, so they are spread apart together.
  // The computed positions never change; only where the labels stand.
  const heights = [
    ...shown.map((p) => labelHeight(p.retrograde)),
    ...shownLots.map(() => labelHeight(false)),
  ];
  /** Radius of a label's centre: its outer edge stays clear of the degree scale. */
  const labelRadius = (longitude: number, height: number) =>
    scale - TICK_FIVE - LABEL.gap - boxReach(screenAngle(longitude), LABEL.width, height);
  const allAngles = spreadAnglesBy(
    [...shown, ...shownLots].map((p) => p.longitude),
    (a, b, i, j) => {
      const middle = (a + b) / 2;
      const height = (heights[i] + heights[j]) / 2;
      return labelSeparation(
        screenAngle(middle),
        LABEL.width + 2,
        height + 1,
        labelRadius(middle, height),
      );
    },
  );
  const displayAngles = allAngles.slice(0, shown.length);
  const lotAngles = allAngles.slice(shown.length);

  /** Where a label stands, and the position line from the exact degree to it. */
  const place = (longitude: number, display: number, height: number) => {
    const radius = labelRadius(display, height);
    const middle = at(display, radius);
    const edge = at(display, radius + boxReach(screenAngle(display), LABEL.width, height) + 1);
    const exact = at(longitude, scale);
    return { top: middle.y - height / 2, x: middle.x, exact, edge };
  };

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
    const five = degree % 5 === 0;
    ticks.push(
      <line
        key={degree}
        {...line(degree, scale, scale - (five ? TICK_FIVE : TICK))}
        stroke={INK}
        strokeWidth={five ? 1 : 0.6}
      />,
    );
  }

  const centered = { textAnchor: "middle", dominantBaseline: "central" } as const;

  return (
    <div className="chart-wheel-box" ref={box}>
      <svg
        className="chart-wheel"
        width={2 * center.x}
        height={2 * center.y}
        viewBox={`0 0 ${2 * center.x} ${2 * center.y}`}
        role="img"
        aria-label="Horoskophjul"
        fontFamily={TEXT_FONT}
      >
        {/* House area: plain white, no alternating colours */}
        <circle cx={center.x} cy={center.y} r={outer} fill="#fff" />

        {/* Zodiac ring: element colours, sign glyphs centred in their fields */}
        {SIGNS.map((sign, index) => {
          const start = index * 30;
          const glyph = at(start + 15, outer - ZODIAC_WIDTH / 2);
          return (
            <g key={sign}>
              <path
                d={sector(start, start + 30, outer, zodiacInner)}
                fill={settings.colors.elements[elementOf(sign)]}
              />
              <text
                x={glyph.x}
                y={glyph.y}
                fontFamily={SYMBOL_FONT}
                fontSize={24}
                fill={INK}
                {...centered}
              >
                {SIGN_GLYPHS[sign]}
              </text>
            </g>
          );
        })}

        {/* Information rings: the ruler's glyph in each segment, nothing else */}
        {rings.map((ring) => (
          <g key={ring.key} className={`wheel-ring wheel-ring-${ring.key}`}>
            <title>{ring.name}</title>
            {ring.segments?.map((segment) => {
              const glyph = at((segment.start + segment.end) / 2, ring.outer - RING_WIDTH / 2);
              return (
                <g key={segment.start}>
                  {segment.start % 30 !== 0 && (
                    <line
                      {...line(segment.start, ring.outer - RING_WIDTH, ring.outer)}
                      stroke={RING_LINE}
                      strokeWidth={0.7}
                    />
                  )}
                  <text
                    x={glyph.x}
                    y={glyph.y}
                    fontFamily={SYMBOL_FONT}
                    fontSize={12}
                    fill={INK}
                    {...centered}
                  >
                    <title>
                      {ring.name}: {POINT_NAMES[segment.lord]}
                    </title>
                    {POINT_GLYPHS[segment.lord]}
                  </text>
                </g>
              );
            })}
            <circle cx={center.x} cy={center.y} r={ring.outer} fill="none" stroke={RING_LINE} strokeWidth={0.8} />
          </g>
        ))}

        {/* Ring outlines, sign boundaries and the degree scale */}
        <circle cx={center.x} cy={center.y} r={outer} fill="none" stroke={INK} strokeWidth={1.5} />
        <circle cx={center.x} cy={center.y} r={zodiacInner} fill="none" stroke={INK} strokeWidth={1} />
        <circle cx={center.x} cy={center.y} r={scale} fill="none" stroke={INK} strokeWidth={1} />
        {SIGNS.map((sign, index) => (
          <g key={sign}>
            {/* Whole-sign house boundary: thin and grey, from the scale to the centre */}
            <line {...line(index * 30, 0, scale)} stroke={FAINT} strokeWidth={0.8} />
            <line {...line(index * 30, scale, outer)} stroke={INK} strokeWidth={1} />
          </g>
        ))}
        {ticks}

        {/* Aspect lines, straight between the exact positions */}
        {aspects
          .filter((aspect) => aspect.kind !== "conjunction")
          .map((aspect) => {
            const a = at(longitudeOf(aspect.a), aspectRadius);
            const b = at(longitudeOf(aspect.b), aspectRadius);
            return (
              <line
                key={`${aspect.a}-${aspect.b}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={settings.colors.aspects[aspect.kind]}
                strokeWidth={aspectLineWidth(aspect.orb, settings.orbs[aspect.kind])}
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
              const a = at(item.from!, aspectRadius);
              const b = at(item.to!, aspectRadius);
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
                  strokeLinecap="round"
                />
              );
            })}

        {/* Whole-sign house numbers, close to the centre */}
        {chart.houses.map((house) => {
          const position = at(SIGNS.indexOf(house.sign) * 30 + 15, houseNumberRadius);
          return (
            <text
              key={house.number}
              className="wheel-house-number"
              x={position.x}
              y={position.y}
              fontSize={10.5}
              fill="#55535a"
              stroke="#fff"
              strokeWidth={3}
              paintOrder="stroke"
              {...centered}
            >
              {house.number}
            </text>
          );
        })}

        {/* Bodies: an upright label and a position line to the exact degree */}
        {shown.map((position, index) => {
          const color = settings.colors.bodies[position.body];
          const label = place(position.longitude, displayAngles[index], heights[index]);
          const marker = at(position.longitude, aspectRadius);
          const text = { fill: color, ...centered };
          return (
            <g key={position.body} className="wheel-body">
              <line
                x1={label.exact.x}
                y1={label.exact.y}
                x2={label.edge.x}
                y2={label.edge.y}
                stroke={color}
                strokeWidth={0.8}
              />
              <circle cx={marker.x} cy={marker.y} r={2} fill={color} />
              <text
                x={label.x}
                y={label.top + LABEL.glyph / 2}
                fontFamily={SYMBOL_FONT}
                fontSize={24}
                {...text}
              >
                {POINT_GLYPHS[position.body]}
              </text>
              <text x={label.x} y={label.top + LABEL.glyph + LABEL.line / 2} fontSize={12.5} {...text}>
                {position.degree}°
              </text>
              <text
                x={label.x}
                y={label.top + LABEL.glyph + LABEL.line * 1.5}
                fontSize={12.5}
                {...text}
              >
                {String(position.minute).padStart(2, "0")}′
              </text>
              {position.retrograde && (
                <text
                  x={label.x}
                  y={label.top + LABEL.glyph + LABEL.line * 2 + LABEL.rx / 2}
                  fontSize={9.5}
                  {...text}
                >
                  Rx
                </text>
              )}
            </g>
          );
        })}

        {/* Lots: their symbol and a thin monochrome position line */}
        {shownLots.map((lot, index) => {
          const label = place(lot.longitude, lotAngles[index], labelHeight(false));
          const text = { fill: INK, ...centered };
          // The wheel has room for degrees and minutes only.
          const reading = lotReading(lot, false);
          return (
            <g key={lot.lot} className="wheel-lot">
              <line
                x1={label.exact.x}
                y1={label.exact.y}
                x2={label.edge.x}
                y2={label.edge.y}
                stroke={INK}
                strokeWidth={0.8}
              />
              <LotGlyph lot={lot.lot} x={label.x} y={label.top + LABEL.glyph / 2} size={22} color={INK} />
              <text x={label.x} y={label.top + LABEL.glyph + LABEL.line / 2} fontSize={12.5} {...text}>
                {reading.degree}°
              </text>
              <text
                x={label.x}
                y={label.top + LABEL.glyph + LABEL.line * 1.5}
                fontSize={12.5}
                {...text}
              >
                {String(reading.minute).padStart(2, "0")}′
              </text>
            </g>
          );
        })}

        {/* Transiting bodies, outside the zodiac ring */}
        {transit?.positions.map((position, index) => {
          const color = settings.colors.bodies[position.body];
          const display = transitAngles[index];
          const exact = at(position.longitude, outer);
          const lineEnd = at(display, outer + TRANSIT.lineEnd);
          const glyph = at(display, outer + TRANSIT.glyph);
          const reading = at(display, outer + TRANSIT.reading);
          const marker = at(position.longitude, aspectRadius);
          const text = { fill: color, ...centered };
          return (
            <g key={position.body} className="wheel-transit">
              <line x1={exact.x} y1={exact.y} x2={lineEnd.x} y2={lineEnd.y} stroke={color} strokeWidth={0.8} />
              <circle cx={exact.x} cy={exact.y} r={1.6} fill={color} />
              <circle cx={marker.x} cy={marker.y} r={2.4} fill="#fff" stroke={color} strokeWidth={1.2} />
              <text x={glyph.x} y={glyph.y} fontFamily={SYMBOL_FONT} fontSize={20} {...text}>
                {POINT_GLYPHS[position.body]}
              </text>
              <text x={reading.x} y={reading.y} fontFamily="inherit" fontSize={9.5} {...text}>
                {formatDegree(position)}
                {position.retrograde ? " Rx" : ""}
              </text>
            </g>
          );
        })}

        {/* Angles: a point with a short stroke and its degree, no line through the wheel */}
        {angles.map(({ label, angle }) => {
          const point = at(angle.longitude, outer);
          const text = at(angle.longitude, outer + (transit ? TRANSIT.angleLabel : 16));
          const theta = normalize(screenAngle(angle.longitude));
          const horizontal = Math.cos((theta * Math.PI) / 180);
          const vertical = Math.sin((theta * Math.PI) / 180);
          const anchor = horizontal > 0.35 ? "start" : horizontal < -0.35 ? "end" : "middle";
          const baseline =
            vertical > 0.35 ? "text-after-edge" : vertical < -0.35 ? "text-before-edge" : "central";
          return (
            <g key={label} className="wheel-angle">
              <line {...line(angle.longitude, outer, outer + 11)} stroke={INK} strokeWidth={1.4} />
              <circle cx={point.x} cy={point.y} r={3.6} fill={INK} />
              <text
                x={text.x}
                y={text.y}
                fontSize={12}
                fontWeight={700}
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
    </div>
  );
}
