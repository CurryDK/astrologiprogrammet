import { useState } from "react";
import {
  POINT_GLYPHS,
  POINT_NAMES,
  SIGN_GLYPHS,
  SIGN_NAMES,
  formatDegree,
  formatMoment,
  formatMomentLong,
  type Body,
  type Moment,
  type PlanetRetrograde,
  type RetroCycle,
  type RetroEvent,
  type RetrogradeReply,
  type ZodiacPoint,
} from "../astro";
import { CYCLE_STATUS_NAMES, RETRO_PHASE_NAMES, formatDaysFrom, retroEventText } from "../eventText";
import { placeLabels, timelineOf, type TimelineBar } from "../retroTimeline";
import { useSettings } from "../settings";

/** The timeline is drawn in these units and scaled to the width of its box. */
const WIDTH = 1000;
const EDGE = 14;
const LANE = 30;
const TEXT = 11;
/** Rough width of a character of the label text. */
const CHARACTER = 5.9;

const BAR_NAMES: Record<TimelineBar["kind"], string> = {
  preShadow: "Forskygge",
  retrograde: "Retrograd",
  postShadow: "Efterskygge",
};

function Position({ point }: { point: ZodiacPoint }) {
  return (
    <>
      {formatDegree(point)}{" "}
      <span className="glyph-inline" title={SIGN_NAMES[point.sign]}>
        {SIGN_GLYPHS[point.sign]}
      </span>
    </>
  );
}

/** Date, clock time, sign and degree of an event; its days only where it is the nearest. */
function EventCell({ event }: { event: RetroEvent | null }) {
  if (!event) return <td className="muted">ikke fundet</td>;
  return (
    <td>
      <div>{formatMoment(event.at, true)}</div>
      <div>
        <Position point={event.position} />
      </div>
      {event.nearest && <div className="muted">{formatDaysFrom(event.days)}</div>}
    </td>
  );
}

/**
 * The graphic timeline of one retrograde cycle: shadow and retrograde
 * period as bars, each event with its date, the reference moment as a
 * vertical line. Pointing at an event shows its clock time, sign and degree.
 */
function CycleTimeline({ cycle, reference }: { cycle: RetroCycle; reference: Moment }) {
  const timeline = timelineOf(cycle, reference.utc);
  const x = (at: number) => EDGE + at * (WIDTH - 2 * EDGE);
  const labels = timeline.marks.map(({ event, at }) => {
    const name = retroEventText(event, cycle);
    const date = formatMoment(event.at, false);
    return { event, name, date, x: x(at), width: Math.max(name.length, date.length) * CHARACTER + 6 };
  });
  const places = placeLabels(labels, WIDTH);
  const lanes = (side: "above" | "below") =>
    Math.max(0, ...places.filter((p) => p.side === side).map((p) => p.lane + 1));
  // Room at the top for the date of the reference moment.
  const top = 20;
  const line = top + lanes("above") * LANE + 14;
  const height = line + 14 + lanes("below") * LANE + 4;
  const referenceDate = formatMoment(reference, false);

  return (
    <figure className="retro-timeline">
      <svg viewBox={`0 0 ${WIDTH} ${height}`} role="img" aria-label="Tidslinje for retrogradcyklussen">
        <line x1={0} y1={line} x2={WIDTH} y2={line} className="retro-axis" />
        {timeline.bars.map((bar) => (
          <rect
            key={bar.kind}
            className={`retro-bar retro-bar-${bar.kind}`}
            x={x(bar.from)}
            y={line - (bar.kind === "retrograde" ? 7 : 5)}
            width={Math.max(x(bar.to) - x(bar.from), 1)}
            height={bar.kind === "retrograde" ? 14 : 10}
          >
            <title>{BAR_NAMES[bar.kind]}</title>
          </rect>
        ))}

        {typeof timeline.reference === "number" ? (
          <g className="retro-reference">
            <line x1={x(timeline.reference)} y1={top - 4} x2={x(timeline.reference)} y2={line + 12} />
            <text
              x={Math.min(Math.max(x(timeline.reference), 70), WIDTH - 70)}
              y={10}
              fontSize={TEXT}
              textAnchor="middle"
            >
              Reference {referenceDate}
            </text>
            <title>Referencetidspunkt: {formatMomentLong(reference)}</title>
          </g>
        ) : (
          <text
            className="retro-reference"
            x={timeline.reference === "before" ? 0 : WIDTH}
            y={10}
            fontSize={TEXT}
            textAnchor={timeline.reference === "before" ? "start" : "end"}
          >
            {timeline.reference === "before"
              ? `← Reference ${referenceDate}`
              : `Reference ${referenceDate} →`}
          </text>
        )}

        {labels.map((label, index) => {
          const place = places[index];
          const station = label.event.kind === "stationRetrograde" || label.event.kind === "stationDirect";
          const up = place.side === "above";
          // The two lines of a label: name over date, nearest the line first below it.
          const first = up ? line - 14 - place.lane * LANE - 17 : line + 14 + place.lane * LANE + 10;
          return (
            <g key={`${label.event.kind}-${label.event.at.utc}`} className="retro-mark">
              <title>
                {label.name} · {formatMomentLong(label.event.at)} · {formatDegree(label.event.position)}{" "}
                {SIGN_NAMES[label.event.position.sign]}
              </title>
              <line
                x1={label.x}
                y1={line}
                x2={label.x}
                y2={up ? first + 16 : first - 9}
                className="retro-leader"
              />
              {place.x !== label.x && (
                <line
                  x1={label.x}
                  y1={up ? first + 16 : first - 9}
                  x2={place.x}
                  y2={up ? first + 16 : first - 9}
                  className="retro-leader"
                />
              )}
              <circle cx={label.x} cy={line} r={station ? 5 : 3.5} className={station ? "retro-dot station" : "retro-dot"} />
              <text x={place.x} y={first} fontSize={TEXT} textAnchor="middle">
                {label.name}
              </text>
              <text x={place.x} y={first + 12} fontSize={TEXT} textAnchor="middle" className="retro-date">
                {label.date}
              </text>
              {/* The whole label answers the pointer. */}
              <rect
                x={place.x - label.width / 2}
                y={first - 10}
                width={label.width}
                height={26}
                fill="transparent"
              />
            </g>
          );
        })}
      </svg>
      {(timeline.before.length > 0 || timeline.after.length > 0) && (
        <figcaption className="retro-outside">
          <span>
            {timeline.before.map((event) => (
              <span key={event.kind} title={formatMomentLong(event.at)}>
                ← {retroEventText(event, cycle)} {formatMoment(event.at, false)}
              </span>
            ))}
          </span>
          <span>
            {timeline.after.map((event) => (
              <span key={event.kind} title={formatMomentLong(event.at)}>
                {retroEventText(event, cycle)} {formatMoment(event.at, false)} →
              </span>
            ))}
          </span>
        </figcaption>
      )}
    </figure>
  );
}

function PlanetCycles({ planet, reference }: { planet: PlanetRetrograde; reference: Moment }) {
  return (
    <section className="panel retro-planet">
      <h2>
        <span className="glyph">{POINT_GLYPHS[planet.body]}</span> {POINT_NAMES[planet.body]} ·{" "}
        <Position point={planet.position} /> ·{" "}
        <span className={`retro-phase retro-phase-${planet.phase}`}>{RETRO_PHASE_NAMES[planet.phase]}</span>
      </h2>
      {planet.cycles.length === 0 && <p className="muted">Ingen retrogradperiode fundet.</p>}
      {planet.cycles.map((cycle) => (
        <div key={cycle.status} className="retro-cycle">
          <h3>
            {CYCLE_STATUS_NAMES[cycle.status]} · stationerer retrograd i {SIGN_NAMES[cycle.sign]}{" "}
            <span className="glyph-inline">{SIGN_GLYPHS[cycle.sign]}</span>
          </h3>
          <CycleTimeline cycle={cycle} reference={reference} />
          <table className="report-table retro-events">
            <thead>
              <tr>
                <th>Begivenhed</th>
                <th>Dato og klokkeslæt</th>
                <th>Position</th>
                <th>Fra referencetidspunktet</th>
              </tr>
            </thead>
            <tbody>
              {cycle.events.map((event) => (
                <tr key={`${event.kind}-${event.at.utc}`} className={event.nearest ? "current" : ""}>
                  <td>{retroEventText(event, cycle)}</td>
                  <td className="number">{formatMoment(event.at, true)}</td>
                  <td className="number">
                    <Position point={event.position} />
                  </td>
                  <td className="muted">{event.nearest ? formatDaysFrom(event.days) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  );
}

/**
 * Retrograde cycles (decision "Planetcyklusser" of 18 November 2026): an
 * overview of the stations of Mercury to Pluto with each planet's phase,
 * and for the chosen planet its retrograde periods with timeline and events.
 */
export function RetrogradePanel({ reply }: { reply: RetrogradeReply }) {
  const { settings } = useSettings();
  const [chosen, setChosen] = useState<Body>("mercury");
  const planet = reply.planets.find((p) => p.body === chosen) ?? reply.planets[0];

  return (
    <>
      <section className="panel">
        <table className="report-table synodic-table retro-table">
          <thead>
            <tr>
              <th>Planet</th>
              <th>Position og fase</th>
              <th>Seneste retrograde stationering</th>
              <th>Næste retrograde stationering</th>
              <th>Seneste direkte stationering</th>
              <th>Næste direkte stationering</th>
            </tr>
          </thead>
          <tbody>
            {reply.planets.map((p) => (
              <tr key={p.body} className={p.body === planet?.body ? "chosen" : ""} onClick={() => setChosen(p.body)}>
                <td>
                  <button className="link" aria-pressed={p.body === planet?.body} onClick={() => setChosen(p.body)}>
                    <span className="glyph" style={{ color: settings.colors.bodies[p.body] }}>
                      {POINT_GLYPHS[p.body]}
                    </span>{" "}
                    {POINT_NAMES[p.body]}
                  </button>
                </td>
                <td>
                  <div>
                    <Position point={p.position} />
                  </div>
                  <div>
                    <span className={`retro-phase retro-phase-${p.phase}`}>{RETRO_PHASE_NAMES[p.phase]}</span>
                  </div>
                </td>
                <EventCell event={p.lastRetrogradeStation} />
                <EventCell event={p.nextRetrogradeStation} />
                <EventCell event={p.lastDirectStation} />
                <EventCell event={p.nextDirectStation} />
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted legend">
          Vælg en planet i tabellen for at se dens retrogradperioder herunder. Antal dage står kun ved
          planetens seneste og næste begivenhed. Tidspunkter vises i computerens tidszone.
        </p>
      </section>

      {planet && <PlanetCycles planet={planet} reference={reply.at} />}

      <section className="panel">
        <p className="retro-legend">
          <span className="retro-key retro-bar-preShadow" /> Forskygge
          <span className="retro-key retro-bar-retrograde" /> Retrograd
          <span className="retro-key retro-bar-postShadow" /> Efterskygge
          <span className="retro-key retro-key-reference" /> Referencetidspunkt
        </p>
        <p className="muted legend">
          Skyggen er strækningen mellem de to stationeringsgrader: forskyggen begynder, når planeten i
          direkte bevægelse sidst passerer graden for den kommende direkte stationering, og efterskyggen
          slutter, når den igen passerer graden for den retrograde stationering. Retrogradtegnet er det
          tegn, planeten stationerer retrograd i; den endelige udtræden er første gang, planeten forlader
          tegnet efter den direkte stationering. Hos de langsomme planeter kan indtræden og udtræden ligge
          flere år væk; de står da med dato ved tidslinjens kant. En langsom planet kan være i
          efterskyggen af én periode og forskyggen af den næste på samme tid. Hold musen over en
          begivenhed på tidslinjen for at se klokkeslæt, tegn og grad.
        </p>
      </section>
    </>
  );
}
