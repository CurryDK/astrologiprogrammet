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
  type ProgressedAspect,
  type RingSegment,
  type TransitAspect,
  type WheelRings,
} from "../astro";
import type { Settings } from "../settings";
import {
  aspectLineWidth,
  boxReach,
  keepInSign,
  labelSeparation,
  normalize,
  spreadAngles,
  spreadAnglesBy,
  wheelAnchor,
} from "../wheelLayout";
import { LotGlyph, SYMBOL_FONT, WHEEL_LOT_SIZE } from "./LotSymbol";

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
const LABEL = { width: 27, glyph: 24, line: 11.5, rx: 9.5, gap: 6 };
/** Size of the degrees and minutes under a planet or lot; kept small so a label fits in its sign. */
const READING_SIZE = 10.5;
const labelHeight = (retrograde: boolean) =>
  LABEL.glyph + 2 * LABEL.line + (retrograde ? LABEL.rx : 0);
/** From the degree scale in to the circle the aspect lines run between. */
const ASPECT_INSET = TICK_FIVE + LABEL.gap + labelHeight(true) + 7;

/** Room outside the wheel for the angle labels. */
const MARGIN = { x: 100, y: 34 };
/**
 * A layer outside the zodiac ring (progressions, transits): how wide its
 * band is, and where its position line ends, its symbol and its reading sit.
 */
const BAND = { width: 62, lineEnd: 16, glyph: 30, reading: 53 };
/** Closest two symbols of an outer layer may sit, in degrees along the wheel. */
const MIN_LAYER_SEPARATION = 7;

/**
 * Smallest radius at which the wheel is still readable with every ring
 * shown. Provisional: the specification leaves the figure to testing.
 */
const MIN_RADIUS = 270;
/**
 * Where the view sizes the wheel so that the whole of it is visible without
 * scrolling (change specification of 16 November 2026), it may go this far
 * below the figure above before it stops shrinking. Provisional as well.
 */
const MIN_RADIUS_TO_FIT = 230;
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
   * The room the whole wheel may take, in pixels, where the view decides it
   * (`PanelBoard`). Without it the wheel measures the element it sits in.
   */
  room?: { width: number; height: number };
  /**
   * A chart whose angles and houses are not known (a Solar Return without a
   * birth time): they are left out, and 0° Aries stands at the left.
   */
  withoutAngles?: boolean;
  /**
   * Live Chart: secondary progressions, drawn in a band outside the zodiac
   * ring, inside the transits. Everything is already filtered by the caller.
   */
  progression?: {
    points: LayerPoint[];
    toNatal: ProgressedAspect[];
    toProgressed: Aspect[];
    /** Maximum orb of progression aspects, for the line thickness. */
    orb: number;
  };
  /**
   * Live Chart: transiting bodies drawn outermost, with their aspect lines.
   * Everything is already filtered by the caller. This is the simple
   * layered display; the dedicated biwheel design is deferred.
   */
  transit?: {
    positions: BodyPosition[];
    toNatal: TransitAspect[];
    toTransit: Aspect[];
    /** Maximum orb of transit aspects, for the line thickness. */
    orb: number;
  };
};

/** A body or angle of an outer layer. */
export type LayerPoint = {
  id: PointId;
  longitude: number;
  degree: number;
  minute: number;
  retrograde: boolean;
};

type LayerName = "natal" | "progression" | "transit";

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
 * of 15 November 2026): whole-sign houses, zodiac running counter-clockwise.
 * The horizontal line at the left holds the exact Ascendant degree, or the
 * start of the first house when that orientation is chosen (decision of
 * 15 November 2026); the angles always stand at their own degrees.
 */
export function ChartWheel({
  chart,
  aspects,
  settings,
  lots = [],
  maxRadius,
  room: givenRoom,
  withoutAngles = false,
  progression,
  transit,
}: Props) {
  const { box, room } = useRoom();
  const tables = useWheelRings();
  // The planet whose aspect lines stand out: the one pointed at, or the one
  // clicked, which stays until it is clicked again or the wheel is clicked.
  const [hovered, setHovered] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const anchor = withoutAngles
    ? 0
    : wheelAnchor(chart.angles.ascendant.longitude, settings.wheel.orientation);

  // Natal innermost, progressions in the middle, transits outermost
  // (decision 9 of 15 November 2026 on progressions).
  const layers = [
    progression && {
      name: "progression" as const,
      points: progression.points,
    },
    transit && {
      name: "transit" as const,
      points: transit.positions.map((p) => ({ ...p, id: p.body as PointId })),
    },
  ]
    .filter((layer) => layer !== undefined)
    .map((layer, index) => ({
      ...layer,
      offset: index * BAND.width,
      // Where each symbol stands along the wheel once crowded ones are spread.
      shownAngles: spreadAngles(
        layer.points.map((p) => p.longitude),
        MIN_LAYER_SEPARATION,
      ),
    }));
  const bands = layers.length;
  const margin = {
    x: MARGIN.x + bands * BAND.width + (bands ? 10 : 0),
    y: MARGIN.y + bands * BAND.width + (bands ? 4 : 0),
  };
  // Beside the side column the whole wheel should fit in the window's height.
  const byHeight = givenRoom
    ? givenRoom.height / 2 - margin.y
    : room.wide
      ? (room.height - 190) / 2 - margin.y
      : Infinity;
  const byWidth = (givenRoom?.width ?? room.width) / 2 - margin.x;
  const outer = Math.round(
    Math.max(
      givenRoom ? MIN_RADIUS_TO_FIT : MIN_RADIUS,
      Math.min(byWidth, byHeight, maxRadius ?? MAX_RADIUS, MAX_RADIUS),
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
  const screenAngle = (longitude: number) => 180 + longitude - anchor;
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
  /**
   * Degrees a label must stand from a sign border at `border` to stay on its
   * own side of it.
   */
  const roomAtBorder = (border: number, height: number) => {
    const reach = boxReach(screenAngle(border) + 90, LABEL.width, height) + 1;
    const ratio = Math.min(reach / Math.max(labelRadius(border, height), 1), 1);
    return (Math.asin(ratio) * 180) / Math.PI;
  };
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
    // Each label would like to stand wholly inside the sign of its planet;
    // the position line still points to the exact degree.
    [...shown, ...shownLots].map((p, i) => {
      const start = Math.floor(p.longitude / 30) * 30;
      return keepInSign(
        p.longitude,
        roomAtBorder(start, heights[i]),
        roomAtBorder(start + 30, heights[i]),
      );
    }),
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

  /**
   * Where an aspect line of a natal point ends: at the planet itself, on the
   * inner edge of its label, so the lines run out to the planets (feedback
   * of 15 November 2026 with a reference picture). A crowded label that has
   * been moved along the wheel takes its line end with it. An angle has no
   * label inside the wheel; its line ends at the degree scale.
   */
  const natalLineEnd = (point: PointId) => {
    const index = isBody(point) ? shown.findIndex((p) => p.body === point) : -1;
    if (index < 0) {
      return at(longitudeOf(point), isBody(point) ? aspectRadius : scale - TICK_FIVE - 2);
    }
    const display = displayAngles[index];
    const reach = boxReach(screenAngle(display), LABEL.width, heights[index]);
    return at(display, labelRadius(display, heights[index]) - reach - 3);
  };

  /**
   * Where a conjunction line from an outer layer meets a natal point: on the
   * outer edge of its label, so the short line does not run through the
   * planet's symbol. With the lines drawn on the inner circle it ends there
   * like the others.
   */
  const natalConjunctionEnd = (point: PointId) => {
    const index = isBody(point) ? shown.findIndex((p) => p.body === point) : -1;
    if (index < 0 || settings.layerLineEnds === "center") return natalLineEnd(point);
    const display = displayAngles[index];
    const reach = boxReach(screenAngle(display), LABEL.width, heights[index]);
    return at(display, labelRadius(display, heights[index]) + reach + 1);
  };

  const layerOf = (name: LayerName) => layers.find((layer) => layer.name === name);
  /** Exact longitude of a point in a layer, if that layer shows it. */
  const layerLongitude = (name: LayerName, point: PointId): number | undefined =>
    name === "natal"
      ? longitudeOf(point)
      : layerOf(name)?.points.find((p) => p.id === point)?.longitude;
  /**
   * Where an aspect line of an outer layer's point ends (a setting): at the
   * planet itself outside the circle, just inside its symbol (feedback of
   * 18 November 2026 with a reference picture; default), at the exact
   * degree on the inner circle, or at the exact degree on the layer's own
   * ring.
   */
  const layerLineEnd = (name: LayerName, point: PointId, longitude: number) => {
    const layer = layerOf(name);
    if (!layer || settings.layerLineEnds === "center") return at(longitude, aspectRadius);
    if (settings.layerLineEnds === "rings") return at(longitude, outer + layer.offset);
    const index = layer.points.findIndex((p) => p.id === point);
    return at(layer.shownAngles[index] ?? longitude, outer + layer.offset + BAND.lineEnd + 3);
  };

  const layerLines = [
    ...(progression
      ? [
          ...progression.toNatal.map((aspect) => ({
            key: `pn-${aspect.progressed}-${aspect.natal}`,
            className: "progression-natal-line",
            from: ["progression", aspect.progressed] as const,
            to: ["natal", aspect.natal] as const,
            aspect,
            orb: progression.orb,
            dash: "2 5",
          })),
          ...progression.toProgressed.map((aspect) => ({
            key: `pp-${aspect.a}-${aspect.b}`,
            className: "progression-progression-line",
            from: ["progression", aspect.a] as const,
            to: ["progression", aspect.b] as const,
            aspect,
            orb: progression.orb,
            dash: "10 4 2 4",
          })),
        ]
      : []),
    ...(transit
      ? [
          ...transit.toNatal.map((aspect) => ({
            key: `tn-${aspect.transit}-${aspect.natal}`,
            className: "transit-natal-line",
            from: ["transit", aspect.transit] as const,
            to: ["natal", aspect.natal] as const,
            aspect,
            orb: transit.orb,
            dash: undefined,
          })),
          ...transit.toTransit.map((aspect) => ({
            key: `tt-${aspect.a}-${aspect.b}`,
            className: "transit-transit-line",
            from: ["transit", aspect.a] as const,
            to: ["transit", aspect.b] as const,
            aspect,
            orb: transit.orb,
            dash: "7 6",
          })),
        ]
      : []),
  ];

  const angles = withoutAngles
    ? []
    : [
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

  // Every aspect line that is drawn, with the two points it joins. A
  // conjunction gets a line only between a natal point and a transiting or
  // progressed one (corrections of 24 November 2026, point 01); never between
  // two natal points, nor between two points of the same outer layer.
  const pointKey = (layer: LayerName, point: PointId) => `${layer}:${point}`;
  const natalLines = aspects
    .filter((aspect) => aspect.kind !== "conjunction")
    .map((aspect) => ({ aspect, ends: [pointKey("natal", aspect.a), pointKey("natal", aspect.b)] }));
  const drawnLayerLines = layerLines.flatMap((item) => {
    const from = layerLongitude(item.from[0], item.from[1]);
    const to = layerLongitude(item.to[0], item.to[1]);
    if (from === undefined || to === undefined) return [];
    if (item.aspect.kind === "conjunction" && item.to[0] !== "natal") return [];
    return [{ ...item, fromLongitude: from, toLongitude: to, ends: [pointKey(item.from[0], item.from[1]), pointKey(item.to[0], item.to[1])] }];
  });
  const joined = new Set([...natalLines, ...drawnLayerLines].flatMap((line) => line.ends));
  /** Natal planets with a line at the inner edge of their label, where the dot goes. */
  const dotted = new Set(
    [
      ...natalLines,
      ...drawnLayerLines.filter(
        (line) => line.aspect.kind !== "conjunction" || settings.layerLineEnds === "center",
      ),
    ].flatMap((line) => line.ends),
  );
  // A clicked planet without lines, or one no longer shown, highlights
  // nothing. Pointing at a planet without lines fades every line until the
  // pointer leaves it (corrections of 24 November 2026, point 02).
  const focus = pinned !== null && joined.has(pinned) ? pinned : hovered;
  /** Lines of the planet in focus at full strength, the others faded. */
  const lineOpacity = (ends: string[], normal: number) =>
    focus === null ? normal : ends.includes(focus) ? 1 : 0.1;
  const focusHandlers = (layer: LayerName, point: PointId) => {
    const key = pointKey(layer, point);
    return {
      onMouseEnter: () => setHovered(key),
      onMouseLeave: () => setHovered(null),
      onClick: (event: { stopPropagation: () => void }) => {
        event.stopPropagation();
        setPinned((current) => (current === key ? null : key));
      },
      style: { cursor: "pointer" },
    };
  };

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
        onClick={() => setPinned(null)}
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

        {/* Aspect lines out to the planets; slightly see-through so crossings stay readable */}
        {natalLines.map(({ aspect, ends }) => {
          const a = natalLineEnd(aspect.a);
          const b = natalLineEnd(aspect.b);
          return (
            <line
              key={`${aspect.a}-${aspect.b}`}
              className="aspect-line"
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={settings.colors.aspects[aspect.kind]}
              strokeWidth={aspectLineWidth(aspect.orb, settings.orbs[aspect.kind])}
              strokeLinecap="round"
              // In a Live Chart the natal aspects step back behind the other layers.
              opacity={lineOpacity(ends, bands ? 0.3 : 0.85)}
            />
          );
        })}

        {/* Aspect lines of the outer layers: transits solid to natal points and dashed among themselves, progressions dotted */}
        {drawnLayerLines.map((item) => {
          const end = ([layer, point]: readonly [LayerName, PointId], longitude: number) =>
            layer !== "natal"
              ? layerLineEnd(layer, point, longitude)
              : item.aspect.kind === "conjunction"
                ? natalConjunctionEnd(point)
                : natalLineEnd(point);
          const a = end(item.from, item.fromLongitude);
          const b = end(item.to, item.toLongitude);
          return (
            <line
              key={item.key}
              className={`aspect-line ${item.className}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={settings.colors.aspects[item.aspect.kind]}
              strokeWidth={aspectLineWidth(item.aspect.orb, item.orb)}
              strokeDasharray={item.dash}
              strokeLinecap="round"
              opacity={lineOpacity(item.ends, 0.85)}
            />
          );
        })}

        {/* A dot in the planet's colour where its lines meet it */}
        {shown
          .filter((position) => dotted.has(pointKey("natal", position.body)))
          .map((position) => {
            const end = natalLineEnd(position.body);
            return (
              <circle
                key={position.body}
                className="aspect-end"
                cx={end.x}
                cy={end.y}
                r={2.4}
                fill={settings.colors.bodies[position.body]}
              />
            );
          })}

        {/* Whole-sign house numbers, close to the centre */}
        {(withoutAngles ? [] : chart.houses).map((house) => {
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
          const text = { fill: color, ...centered };
          return (
            <g key={position.body} className="wheel-body" {...focusHandlers("natal", position.body)}>
              {/* The whole label answers the pointer; outlined while its lines are in focus. */}
              <rect
                x={label.x - LABEL.width / 2 - 1}
                y={label.top - 1}
                width={LABEL.width + 2}
                height={heights[index] + 2}
                rx={4}
                fill="transparent"
                stroke={focus === pointKey("natal", position.body) ? color : "none"}
                strokeWidth={1}
                strokeOpacity={0.6}
              />
              <line
                x1={label.exact.x}
                y1={label.exact.y}
                x2={label.edge.x}
                y2={label.edge.y}
                stroke={color}
                strokeWidth={0.8}
              />
              <text
                x={label.x}
                y={label.top + LABEL.glyph / 2}
                fontFamily={SYMBOL_FONT}
                fontSize={24}
                {...text}
              >
                {POINT_GLYPHS[position.body]}
              </text>
              <text x={label.x} y={label.top + LABEL.glyph + LABEL.line / 2} fontSize={READING_SIZE} {...text}>
                {position.degree}°
              </text>
              <text
                x={label.x}
                y={label.top + LABEL.glyph + LABEL.line * 1.5}
                fontSize={READING_SIZE}
                {...text}
              >
                {String(position.minute).padStart(2, "0")}′
              </text>
              {position.retrograde && (
                <text
                  x={label.x}
                  y={label.top + LABEL.glyph + LABEL.line * 2 + LABEL.rx / 2}
                  fontSize={8.5}
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
              <LotGlyph lot={lot.lot} x={label.x} y={label.top + LABEL.glyph / 2} size={WHEEL_LOT_SIZE} color={INK} />
              <text x={label.x} y={label.top + LABEL.glyph + LABEL.line / 2} fontSize={READING_SIZE} {...text}>
                {reading.degree}°
              </text>
              <text
                x={label.x}
                y={label.top + LABEL.glyph + LABEL.line * 1.5}
                fontSize={READING_SIZE}
                {...text}
              >
                {String(reading.minute).padStart(2, "0")}′
              </text>
            </g>
          );
        })}

        {/* Outer layers: progressions next to the zodiac ring, transits outermost */}
        {layers.map((layer) => {
          const base = outer + layer.offset;
          const shownAngles = layer.shownAngles;
          return (
            <g key={layer.name} className={`wheel-layer wheel-layer-${layer.name}`}>
              {layer.offset > 0 && (
                <circle cx={center.x} cy={center.y} r={base} fill="none" stroke={FAINT} strokeWidth={0.8} />
              )}
              {layer.points.map((point, index) => {
                const color = isBody(point.id) ? settings.colors.bodies[point.id] : INK;
                const display = shownAngles[index];
                const exact = at(point.longitude, base);
                const lineEnd = at(display, base + BAND.lineEnd);
                const glyph = at(display, base + BAND.glyph);
                const reading = at(display, base + BAND.reading);
                const marker = at(point.longitude, aspectRadius);
                const text = { fill: color, ...centered };
                return (
                  <g key={point.id} className={`wheel-${layer.name}`} {...focusHandlers(layer.name, point.id)}>
                    <circle
                      cx={glyph.x}
                      cy={glyph.y}
                      r={12}
                      fill="transparent"
                      stroke={focus === pointKey(layer.name, point.id) ? color : "none"}
                      strokeOpacity={0.6}
                    />
                    <line x1={exact.x} y1={exact.y} x2={lineEnd.x} y2={lineEnd.y} stroke={color} strokeWidth={0.8} />
                    <circle cx={exact.x} cy={exact.y} r={1.6} fill={color} />
                    {settings.layerLineEnds === "center" &&
                      (layer.name === "transit" ? (
                        <circle cx={marker.x} cy={marker.y} r={2.4} fill="#fff" stroke={color} strokeWidth={1.2} />
                      ) : (
                        <rect
                          x={marker.x - 2.4}
                          y={marker.y - 2.4}
                          width={4.8}
                          height={4.8}
                          transform={`rotate(45 ${marker.x} ${marker.y})`}
                          fill="#fff"
                          stroke={color}
                          strokeWidth={1.2}
                        />
                      ))}
                    {isBody(point.id) ? (
                      <text x={glyph.x} y={glyph.y} fontFamily={SYMBOL_FONT} fontSize={20} {...text}>
                        {POINT_GLYPHS[point.id]}
                      </text>
                    ) : (
                      <text x={glyph.x} y={glyph.y} fontSize={10} fontWeight={700} {...text}>
                        {POINT_GLYPHS[point.id]}
                      </text>
                    )}
                    <text x={reading.x} y={reading.y} fontFamily="inherit" fontSize={9.5} {...text}>
                      {formatDegree(point)}
                      {point.retrograde ? " Rx" : ""}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* Angles: a point with a short stroke and its degree, no line through the wheel */}
        {angles.map(({ label, angle }) => {
          const point = at(angle.longitude, outer);
          const text = at(angle.longitude, outer + bands * BAND.width + 16);
          const theta = normalize(screenAngle(angle.longitude));
          const horizontal = Math.cos((theta * Math.PI) / 180);
          const vertical = Math.sin((theta * Math.PI) / 180);
          const textAnchor = horizontal > 0.35 ? "start" : horizontal < -0.35 ? "end" : "middle";
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
                textAnchor={textAnchor}
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
