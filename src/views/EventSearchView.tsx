import { useState } from "react";
import { api } from "../api";
import {
  SIGN_GLYPHS,
  SIGN_NAMES,
  birthInputOf,
  formatDegree,
  formatMoment,
  localZone,
  type AspectGroups,
  type ChartRecord,
  type SearchResult,
} from "../astro";
import { PointFilter } from "../components/PointFilter";
import { EVENT_TYPE_NAMES, defaultPointChoice, eventText } from "../eventText";
import { useSettings, type Settings } from "../settings";

type Props = {
  record: ChartRecord;
  onBack: () => void;
  /** Open the Live Chart at a UTC instant. */
  onLive: (at: string) => void;
};

export const GROUP_LABELS: [keyof AspectGroups, string][] = [
  ["transitToNatal", "Transit til natal"],
  ["transitToTransit", "Transit til transit"],
  ["progressedToNatal", "Sekundær progression til natal"],
  ["progressedToProgressed", "Sekundær progression til sekundær progression"],
];

const PROGRESSED_LABELS: [keyof Settings["search"]["progressed"], string][] = [
  ["signChanges", "Tegnskift for progressive planeter"],
  ["stations", "Progressive stationeringer"],
  ["moonHouses", "Progressiv Måne skifter natalhus"],
  ["angleSigns", "Progressiv ASC og MC skifter tegn"],
  ["lunationsMajor", "Lunationsfaser: nymåne, kvarterer, fuldmåne"],
  ["lunationsMinor", "Lunationsfaser ved 45°, 135°, 225°, 315°"],
  ["bounds", "Progressive planeter skifter egyptisk bound"],
  ["decans", "Progressive planeter skifter dekan"],
];

/** Today, or a year from today, as `YYYY-MM-DD` on the computer's calendar. */
function dateFromToday(years: number): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear() + years}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Search for exact events (specification §10, decisions of 18 November
 * 2026, points 7 and 8): exact aspects in the four decided combinations,
 * sign changes, stations and the progressed events, limited by period,
 * objects and aspect kinds, listed in time order. Separate from the time
 * navigation; nothing moves by itself.
 */
export function EventSearchView({ record, onBack, onLive }: Props) {
  const { settings, update } = useSettings();
  const zone = localZone();
  const options = settings.search;
  const [start, setStart] = useState(() => dateFromToday(0));
  const [end, setEnd] = useState(() => dateFromToday(1));
  const [choice, setChoice] = useState(() => defaultPointChoice(settings));
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const change = (next: (search: Settings["search"]) => Settings["search"]) =>
    update((s) => ({ ...s, search: next(s.search) }));

  async function search() {
    setBusy(true);
    setError(null);
    try {
      const [from, to] = await Promise.all([
        api.localResolve(start, "00:00", zone),
        api.localResolve(end, "23:59", zone),
      ]);
      const found = await api.eventSearch(
        birthInputOf(record),
        {
          start: from.utc,
          end: to.utc,
          transitBodies: choice.transitBodies,
          progressedPoints: choice.progressedPoints,
          natalPoints: choice.natalPoints,
          aspectKinds: choice.kinds,
          ...options.groups,
          transitSignChanges: options.transitSignChanges,
          transitStations: options.transitStations,
          progressedSignChanges: options.progressed.signChanges,
          progressedStations: options.progressed.stations,
          progressedMoonHouses: options.progressed.moonHouses,
          progressedAngleSigns: options.progressed.angleSigns,
          lunationsMajor: options.progressed.lunationsMajor,
          lunationsMinor: options.progressed.lunationsMinor,
          progressedBounds: options.progressed.bounds,
          progressedDecans: options.progressed.decans,
          angleMethod: settings.progressions.angleMethod,
          birthTimeKnown: record.birthTime !== null,
        },
        zone,
      );
      setResult(found);
    } catch (reason) {
      setError(String(reason));
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  const check = (label: string, checked: boolean, set: (on: boolean) => void) => (
    <label key={label} className="check">
      <input type="checkbox" checked={checked} onChange={(e) => set(e.target.checked)} />
      {label}
    </label>
  );

  return (
    <div className="report-view">
      <header className="chart-header">
        <div className="chart-title">
          <h1>Søgning efter eksakte begivenheder · {record.name}</h1>
        </div>
        <div className="actions">
          <button onClick={onBack}>Natalhoroskop</button>
        </div>
      </header>

      {record.birthTime === null && (
        <p className="notice">
          Fødselstidspunktet er ukendt, og kl. 12:00 er anvendt. Progressive akser og Månens husskift
          udelades. Alle progressive begivenheder og aspekter til natal Måne er markeret ≈: deres
          tidspunkt kan ligge langt fra det viste (et halvt døgns fødselstid svarer til et halvt års
          progression).
        </p>
      )}

      <div className="report-columns">
        <section className="panel">
          <h2>Periode</h2>
          <div className="report-controls">
            <label>
              Fra
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label>
              Til
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </label>
          </div>
          <h2>Eksakte aspekter</h2>
          <div className="check-list">
            {GROUP_LABELS.map(([key, label]) =>
              check(label, options.groups[key], (on) =>
                change((s) => ({ ...s, groups: { ...s.groups, [key]: on } })),
              ),
            )}
          </div>
          <h2>Transitter</h2>
          <div className="check-list">
            {check("Planetære tegnskift", options.transitSignChanges, (on) =>
              change((s) => ({ ...s, transitSignChanges: on })),
            )}
            {check("Stationeringer retrograd/direkte", options.transitStations, (on) =>
              change((s) => ({ ...s, transitStations: on })),
            )}
          </div>
          <h2>Progressive begivenheder</h2>
          <div className="check-list">
            {PROGRESSED_LABELS.map(([key, label]) =>
              check(label, options.progressed[key], (on) =>
                change((s) => ({ ...s, progressed: { ...s.progressed, [key]: on } })),
              ),
            )}
          </div>
          <div className="actions">
            <button className="primary" onClick={search} disabled={busy}>
              {busy ? "Søger …" : "Søg"}
            </button>
          </div>
        </section>

        <section className="panel">
          <h2>Planeter, punkter og aspekttyper</h2>
          <PointFilter choice={choice} onChange={setChoice} settings={settings} />
          <p className="muted legend">
            Der søges aldrig efter aspekter mellem transitter og progressioner. Progressive akser
            sammenlignes kun med natale planeter. Tidspunkter vises i computerens tidszone.
          </p>
        </section>
      </div>

      {error && <p className="error">Søgningen mislykkedes: {error}</p>}

      {result && (
        <section className="panel">
          <h2>
            {result.events.length} {result.events.length === 1 ? "begivenhed" : "begivenheder"}
          </h2>
          {result.truncated && (
            <p className="notice">
              Der blev fundet flere, end der vises. Kun de tidligste {result.events.length} er med; vælg
              en kortere periode eller færre objekter.
            </p>
          )}
          {result.events.length > 0 && (
            <table className="report-table">
              <thead>
                <tr>
                  <th>Dato og klokkeslæt</th>
                  <th>Begivenhed</th>
                  <th>Position</th>
                  <th>Art</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {result.events.map((event, index) => (
                  <tr key={index}>
                    <td className="number">
                      {event.uncertain && <span title="Usikkert: fødselstidspunktet er ukendt">≈ </span>}
                      {formatMoment(event.at, true)}
                    </td>
                    <td>{eventText(event)}</td>
                    <td>
                      {formatDegree(event.position)}{" "}
                      <span className="glyph-inline" title={SIGN_NAMES[event.position.sign]}>
                        {SIGN_GLYPHS[event.position.sign]}
                      </span>
                    </td>
                    <td className="muted">{EVENT_TYPE_NAMES[event.type]}</td>
                    <td>
                      <button className="link" onClick={() => onLive(event.utc)}>
                        Vis i Live Chart
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </div>
  );
}
