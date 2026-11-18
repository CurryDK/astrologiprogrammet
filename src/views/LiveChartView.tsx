import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { aspectsForView } from "../aspectFilter";
import {
  BODIES,
  POINTS,
  POINT_GLYPHS,
  POINT_NAMES,
  SIGN_GLYPHS,
  SIGN_NAMES,
  birthInputOf,
  formatBirthDate,
  formatDegree,
  formatMoment,
  isBody,
  localZone,
  type Angle,
  type Body,
  type ChartRecord,
  type ComputedChart,
  type LiveChart,
  type PointId,
  type TimeStep,
} from "../astro";
import { ChartWheel, type LayerPoint } from "../components/ChartWheel";
import { ChartAnalysisPanel } from "../components/ChartAnalysisPanel";
import { ConditionPanel } from "../components/ConditionPanel";
import { LifeEventsPanel, type EventPrefill } from "../components/LifeEventsPanel";
import { LotsTable } from "../components/LotsTable";
import { Box, PanelBoard, ResetLayoutButton } from "../components/PanelBoard";
import { PositionsTable } from "../components/PositionsTable";
import { TimeNavigator } from "../components/TimeNavigator";
import { TransitAspectTable } from "../components/TransitAspectTable";
import {
  filterPlanets,
  progressionToNatalForView,
  progressionToProgressedForView,
  transitToNatalForView,
  transitToTransitForView,
} from "../liveFilter";
import { formatShift, minutesBetween, shiftClock, type BirthClock } from "../rectification";
import { useSettings, type Settings } from "../settings";

type Props = {
  record: ChartRecord;
  /** UTC instant to open at; null opens at the present moment. */
  initialAt: string | null;
  onBack: () => void;
  /**
   * A rectified birth time was saved, as a new chart or over this one.
   * `at` is the moment the Live Chart shows, to stay on.
   */
  onRectified: (saved: ChartRecord, at: string | null) => Promise<void>;
};

const progressedDateFormat = new Intl.DateTimeFormat("da-DK", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const RECTIFY_STEPS: [string, number][] = [
  ["−1 t", -60],
  ["−10 min", -10],
  ["−1 min", -1],
  ["+1 min", 1],
  ["+10 min", 10],
  ["+1 t", 60],
];

/**
 * Live Chart (specification §8, §9): the natal chart with the secondary
 * progressions and the transits of a chosen moment around it. Both layers
 * always share that moment, which is moved by hand. Age and profections
 * follow it. The birth time can be adjusted here for rectification while
 * the moment stands still.
 */
export function LiveChartView({ record, initialAt, onBack, onRectified }: Props) {
  const { settings, update } = useSettings();
  const zone = localZone();
  const [natal, setNatal] = useState<ComputedChart | null>(null);
  const [live, setLive] = useState<LiveChart | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The moment last shown, so a step starts from it even before React re-renders.
  const shownAt = useRef<string | null>(initialAt);
  const busy = useRef(false);

  // Rectification: the adjusted birth clock, or null while nothing is changed.
  // The stored chart is untouched until the user saves.
  const [adjusted, setAdjusted] = useState<BirthClock | null>(null);
  const [saveAs, setSaveAs] = useState<"new" | "overwrite">("new");
  const [saving, setSaving] = useState(false);
  // "Gem som livsbegivenhed": the shown moment, handed to the life event form.
  const [eventPrefill, setEventPrefill] = useState<EventPrefill | null>(null);
  const original: BirthClock = useMemo(
    () => ({ date: record.birthDate, time: record.birthTime ?? "12:00" }),
    [record.birthDate, record.birthTime],
  );
  const clock = adjusted ?? original;
  const shift = adjusted ? minutesBetween(original, adjusted) : 0;
  const changed = adjusted !== null && (shift !== 0 || record.birthTime === null);
  /** The chart every calculation uses: the stored one, or it with the adjusted birth time. */
  const working: ChartRecord = useMemo(
    () => (adjusted ? { ...record, birthDate: adjusted.date, birthTime: adjusted.time } : record),
    [record, adjusted],
  );

  const { orb } = settings.transits;
  const { yearStart, leapDay } = settings.profections;
  const progressionOrb = settings.progressions.orb;
  const { angleMethod } = settings.progressions;

  const load = useCallback(
    async (at: string | null, step: TimeStep | null) => {
      // A held arrow fires faster than a slow machine may answer; skip a beat then.
      if (busy.current && step) return;
      busy.current = true;
      try {
        const result = await api.liveChart({
          birth: birthInputOf(working),
          at,
          step,
          zone,
          orb,
          profections: { yearStart, leapDay },
          progression: { orb: progressionOrb, angleMethod },
        });
        shownAt.current = result.at.utc;
        setLive(result);
        setError(null);
      } catch (reason) {
        setError(String(reason));
      } finally {
        busy.current = false;
      }
    },
    [working, zone, orb, yearStart, leapDay, progressionOrb, angleMethod],
  );

  // First load, and again when the chart, the adjusted birth time or a
  // setting behind the numbers changes. The shown moment stays where it is.
  useEffect(() => {
    load(shownAt.current, null);
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    api
      .chartCompute(birthInputOf(working), settings.orbs, {
        sectOverride: working.sectOverride,
        orb: settings.lots.orb,
        exactOrb: settings.lots.exactOrb,
      })
      .then((result) => {
        if (!cancelled) setNatal(result);
      })
      .catch((reason) => {
        if (!cancelled) setError(String(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [working, settings.orbs, settings.lots.orb, settings.lots.exactOrb]);

  const goTo = (utc: string) => load(utc, null);
  const setTransits = (change: (t: Settings["transits"]) => Settings["transits"]) =>
    update((s) => ({ ...s, transits: change(s.transits) }));
  const setProgressions = (change: (p: Settings["progressions"]) => Settings["progressions"]) =>
    update((s) => ({ ...s, progressions: change(s.progressions) }));

  async function saveRectified() {
    setSaving(true);
    try {
      const asNew = saveAs === "new";
      const saved = await api.chartSave(
        asNew
          ? {
              ...working,
              id: null,
              name: `${record.name} (rektificeret ${clock.time})`,
              featured: false,
            }
          : working,
      );
      if (asNew && record.id !== null && saved.id !== null) {
        // The life events are what the birth time was tested against; the new chart keeps them.
        for (const event of await api.eventsList(record.id)) {
          await api.eventSave({ ...event, id: null, chartId: saved.id });
        }
      }
      await onRectified(saved, shownAt.current);
      setAdjusted(null);
      setError(null);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setSaving(false);
    }
  }

  const planets =
    live && natal
      ? filterPlanets(
          settings.transits.filters,
          live.profection,
          live.profectionMonth,
          natal.chart.positions,
          live.positions,
        )
      : null;
  const month = live?.profection?.months.find((m) => m.number === live.profectionMonth) ?? null;
  const { groups, filters } = settings.transits;
  const showTransits = settings.transits.show;
  const progressed = settings.progressions.show ? (live?.progressions ?? null) : null;
  const progressedAngles: [PointId, Angle][] = progressed?.angles
    ? [
        ["ascendant", progressed.angles.ascendant],
        ["midheaven", progressed.angles.midheaven],
      ]
    : [];
  const progressedPoints: LayerPoint[] = progressed
    ? [
        ...progressed.positions.map((p) => ({ ...p, id: p.body as PointId })),
        ...progressedAngles.map(([id, angle]) => ({ ...angle, id, retrograde: false })),
      ].filter((point) => settings.progressions.showInWheel[point.id])
    : [];

  const birth = birthInputOf(working);

  /**
   * Opens the life event form with the moment the Live Chart shows, not the
   * computer's present time: the date and clock time as shown, in the time
   * zone they are shown in, which the event stores.
   */
  function saveAsEvent() {
    if (!live) return;
    update((s) => ({ ...s, layout: { ...s.layout, live: { ...s.layout.live, events: true } } }));
    setEventPrefill({
      key: Date.now(),
      date: live.at.local.slice(0, 10),
      time: live.at.local.slice(11, 16),
      zone,
    });
  }

  return (
    <div className="chart-view live-chart">
      <header className="chart-header">
        <div className="chart-title">
          <h1>Live Chart · {record.name}</h1>
          <p className="muted">
            Født {formatBirthDate(working.birthDate)}
            {working.birthTime
              ? ` kl. ${working.birthTime}`
              : " (fødselstid ukendt, kl. 12:00 anvendt)"}
            {changed && " – justeret, ikke gemt"}
            {" · "}natalpositionerne står fast, progressioner og transitter følger tidspunktet
          </p>
        </div>
        <div className="actions">
          <ResetLayoutButton view="live" />
          <button onClick={onBack}>Tilbage til horoskopet</button>
        </div>
      </header>

      {error && <p className="error">Beregningen mislykkedes: {error}</p>}

      {live && natal && (
        <PanelBoard
          view="live"
          wheel={(room) => (
              <ChartWheel
                chart={natal.chart}
                aspects={groups.natal ? aspectsForView(natal.aspects, settings, "wheel") : []}
                settings={settings}
                lots={natal.lots?.positions}
                room={room}
                progression={
                  progressed
                    ? {
                        points: progressedPoints,
                        toNatal: progressionToNatalForView(progressed.toNatal, settings, "wheel"),
                        toProgressed: progressionToProgressedForView(
                          progressed.toProgressed,
                          settings,
                          "wheel",
                        ),
                        orb: progressionOrb,
                      }
                    : undefined
                }
                transit={
                  showTransits
                    ? {
                        positions: live.positions.filter((p) => settings.transits.showInWheel[p.body]),
                        toNatal: transitToNatalForView(live.toNatal, settings, "wheel", planets),
                        toTransit: transitToTransitForView(live.toTransit, settings, "wheel", planets),
                        orb,
                      }
                    : undefined
                }
              />
          )}
        >
            <Box id="time" title="Tidspunkt" span="side" fixed pinned className="time-box">
          <TimeNavigator
            at={live.at}
            zone={zone}
            unit={settings.transits.stepUnit}
            onUnit={(stepUnit) => setTransits((t) => ({ ...t, stepUnit }))}
            onStep={(direction) =>
              load(shownAt.current, { unit: settings.transits.stepUnit, count: direction })
            }
            onNow={() => load(null, null)}
            onGoTo={goTo}
            extra={
              record.id !== null && (
                <button
                  onClick={saveAsEvent}
                  title="Opretter en livsbegivenhed med det viste tidspunkt; navn, dato og klokkeslæt kan rettes, før den gemmes"
                >
                  Gem som livsbegivenhed
                </button>
              )
            }
          />
          <div className="live-profection">
            {live.age === null || !live.profection ? (
              <span className="muted">Tidspunktet ligger før fødslen; ingen alder eller profektion.</span>
            ) : (
              <>
                <span>
                  <strong>Alder {live.age}</strong>
                </span>
                <span>
                  Årets Time Lord:{" "}
                  <span
                    className="glyph-inline"
                    style={{ color: settings.colors.bodies[live.profection.timeLord] }}
                  >
                    {POINT_GLYPHS[live.profection.timeLord]}
                  </span>{" "}
                  <strong>{POINT_NAMES[live.profection.timeLord]}</strong>{" "}
                  <span className="muted">
                    ({live.profection.house}. hus,{" "}
                    <span className="glyph-inline">{SIGN_GLYPHS[live.profection.sign]}</span>{" "}
                    {SIGN_NAMES[live.profection.sign]})
                  </span>
                </span>
                {month && (
                  <span>
                    Måned {month.number}:{" "}
                    <span className="glyph-inline" style={{ color: settings.colors.bodies[month.ruler] }}>
                      {POINT_GLYPHS[month.ruler]}
                    </span>{" "}
                    {POINT_NAMES[month.ruler]}{" "}
                    <span className="muted">
                      ({month.house}. hus, <span className="glyph-inline">{SIGN_GLYPHS[month.sign]}</span>{" "}
                      {SIGN_NAMES[month.sign]}, til {formatMoment(month.end, false)})
                    </span>
                  </span>
                )}
                {live.progressions && (
                  <span className="muted">
                    Progressioner: himlen {progressedDateFormat.format(new Date(live.progressions.utc))}
                  </span>
                )}
              </>
            )}
          </div>
            </Box>

            <Box
              id="rectification"
              title={`Rektifikation${changed ? ` · ${formatShift(shift)}` : ""}`}
              span="side"
              className="rectification"
            >
          <div className="rectify-row">
            <span>Fødselstid</span>
            {RECTIFY_STEPS.slice(0, 3).map(([label, minutes]) => (
              <button
                key={label}
                className="small"
                aria-label={`Fødselstid ${label}`}
                onClick={() => setAdjusted(shiftClock(clock, minutes))}
              >
                {label}
              </button>
            ))}
            <input
              type="time"
              aria-label="Fødselstid"
              value={clock.time}
              onChange={(e) => {
                if (/^\d{2}:\d{2}$/.test(e.target.value)) {
                  setAdjusted({ date: clock.date, time: e.target.value });
                }
              }}
            />
            {RECTIFY_STEPS.slice(3).map(([label, minutes]) => (
              <button
                key={label}
                className="small"
                aria-label={`Fødselstid ${label}`}
                onClick={() => setAdjusted(shiftClock(clock, minutes))}
              >
                {label}
              </button>
            ))}
            <span className="muted">
              {clock.date !== original.date && `${formatBirthDate(clock.date)} · `}
              Oprindelig: {record.birthTime ?? "ukendt"}
              {changed && ` · ændring: ${formatShift(shift)}`}
            </span>
          </div>
          {changed && (
            <div className="rectify-row">
              <label>
                <input
                  type="radio"
                  name="rectify-save"
                  checked={saveAs === "new"}
                  onChange={() => setSaveAs("new")}
                />{" "}
                Gem som nyt horoskop
              </label>
              <label>
                <input
                  type="radio"
                  name="rectify-save"
                  checked={saveAs === "overwrite"}
                  onChange={() => setSaveAs("overwrite")}
                />{" "}
                Overskriv
              </label>
              <button className="primary" disabled={saving} onClick={saveRectified}>
                Gem
              </button>
              <button disabled={saving} onClick={() => setAdjusted(null)}>
                Nulstil
              </button>
            </div>
          )}
          <p className="muted legend">
            Live Chart-tidspunktet står fast, mens fødselstiden justeres. Natalpositioner, ASC/MC,
            huse, lots, profektioner, Planetary Condition, progressioner og aspekter regnes om med
            det samme; transitplaneternes positioner ændres ikke. Den oprindelige fødselstid
            bevares, indtil der gemmes.
          </p>
            </Box>

            <Box id="display" title="Visning">
              <p className="muted legend">
                Inderst natalhoroskopet, i midten de sekundære progressioner, yderst transitterne.
                Fuldt optrukne linjer: transit → natal. Stiplede: transit → transit. Prikkede:
                progression → natal. Streg-prik: progression → progression. Svage: natale
                aspekter.
              </p>
              <table className="display-table">
                <thead>
                  <tr>
                    <th>Lag</th>
                    <th>Vis</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Sekundære progressioner</td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label="Vis sekundære progressioner"
                        checked={settings.progressions.show}
                        onChange={(e) => setProgressions((p) => ({ ...p, show: e.target.checked }))}
                      />
                    </td>
                    <td></td>
                  </tr>
                  <tr>
                    <td>Transitter</td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label="Vis transitter"
                        checked={showTransits}
                        onChange={(e) => setTransits((t) => ({ ...t, show: e.target.checked }))}
                      />
                    </td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
              <table className="display-table">
                <thead>
                  <tr>
                    <th>Aspektgrupper</th>
                    <th>Vis</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ["toNatal", "Progression → natal"],
                      ["toProgressed", "Progression → progression"],
                    ] as const
                  ).map(([group, label]) => (
                    <tr key={group}>
                      <td>{label}</td>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={label}
                          checked={settings.progressions.groups[group]}
                          onChange={(e) =>
                            setProgressions((p) => ({
                              ...p,
                              groups: { ...p.groups, [group]: e.target.checked },
                            }))
                          }
                        />
                      </td>
                      <td></td>
                    </tr>
                  ))}
                  {(
                    [
                      ["toNatal", "Transit → natal"],
                      ["toTransit", "Transit → transit"],
                      ["natal", "Natale aspekter (i hjulet)"],
                    ] as const
                  ).map(([group, label]) => (
                    <tr key={group}>
                      <td>{label}</td>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={label}
                          checked={groups[group]}
                          onChange={(e) =>
                            setTransits((t) => ({
                              ...t,
                              groups: { ...t.groups, [group]: e.target.checked },
                            }))
                          }
                        />
                      </td>
                      <td></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <table className="display-table">
                <thead>
                  <tr>
                    <th>Vis kun transitaspekter med</th>
                    <th>Filter</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ["yearLord", "Årets Time Lord"],
                      ["monthLord", "Månedens Time Lord"],
                      ["profectionSign", "Planeter i årets profektionstegn"],
                    ] as const
                  ).map(([filter, label]) => (
                    <tr key={filter}>
                      <td>{label}</td>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Filter: ${label}`}
                          checked={filters[filter]}
                          onChange={(e) =>
                            setTransits((t) => ({
                              ...t,
                              filters: { ...t.filters, [filter]: e.target.checked },
                            }))
                          }
                        />
                      </td>
                      <td></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted legend">
                Filtrene kan kombineres: et aspekt vises, når en af de valgte planeter indgår, som
                transitplanet eller som natalplanet. Uden filtre vises alle. Filtrene gælder ikke
                progressionsaspekter.
              </p>
              <table className="display-table">
                <thead>
                  <tr>
                    <th>Progressioner</th>
                    <th>I hjulet</th>
                    <th>Aspekter</th>
                  </tr>
                </thead>
                <tbody>
                  {POINTS.map((point) => (
                    <tr key={point}>
                      <td>
                        <span
                          className={isBody(point) ? "glyph" : "angle-label"}
                          style={isBody(point) ? { color: settings.colors.bodies[point] } : undefined}
                        >
                          {POINT_GLYPHS[point]}
                        </span>{" "}
                        {POINT_NAMES[point]}
                      </td>
                      {(["showInWheel", "inAspects"] as const).map((choice) => (
                        <td key={choice}>
                          <input
                            type="checkbox"
                            aria-label={`Progressiv ${POINT_NAMES[point]} ${
                              choice === "showInWheel" ? "i hjulet" : "i aspekter"
                            }`}
                            checked={settings.progressions[choice][point]}
                            onChange={(e) =>
                              setProgressions((p) => ({
                                ...p,
                                [choice]: { ...p[choice], [point]: e.target.checked },
                              }))
                            }
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <table className="display-table">
                <thead>
                  <tr>
                    <th>Transitplaneter</th>
                    <th>I hjulet</th>
                    <th>Aspekter</th>
                  </tr>
                </thead>
                <tbody>
                  {BODIES.map((body) => (
                    <tr key={body}>
                      <td>
                        <span className="glyph" style={{ color: settings.colors.bodies[body] }}>
                          {POINT_GLYPHS[body]}
                        </span>{" "}
                        {POINT_NAMES[body]}
                      </td>
                      {(["showInWheel", "inAspects"] as const).map((choice) => (
                        <td key={choice}>
                          <input
                            type="checkbox"
                            aria-label={`Transit ${POINT_NAMES[body]} ${
                              choice === "showInWheel" ? "i hjulet" : "i aspekter"
                            }`}
                            checked={settings.transits[choice][body]}
                            onChange={(e) =>
                              setTransits((t) => ({
                                ...t,
                                [choice]: { ...t[choice], [body]: e.target.checked },
                              }))
                            }
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted legend">
                Natalplaneternes synlighed og aspekter vælges under “Visning” ved horoskopet. Orb for
                transitaspekter ({orb}°) og progressionsaspekter ({progressionOrb}°) ændres under
                Indstillinger.
              </p>
            </Box>

            {settings.progressions.show && !live.progressions && (
              <Box id="noProgressions" title="Sekundære progressioner" fixed>
                <p className="muted">Tidspunktet ligger før fødslen; ingen progressioner.</p>
              </Box>
            )}

            {progressed && settings.progressions.groups.toNatal && (
              <Box id="progressionToNatal" title="Progression → natal">
                <TransitAspectTable
                  rows={progressionToNatalForView(progressed.toNatal, settings, "table").map((a) => ({
                    ...a,
                    moving: a.progressed,
                    other: a.natal,
                  }))}
                  labels={["Progression", "Natal"]}
                  settings={settings}
                  at={live.at.utc}
                  findPasses={(row) =>
                    api.progressionPasses({
                      birth,
                      progressed: row.moving,
                      other: { natal: row.other },
                      kind: row.kind,
                      at: live.at.utc,
                      zone,
                      angleMethod,
                    })
                  }
                  onGoTo={goTo}
                />
              </Box>
            )}

            {progressed && settings.progressions.groups.toProgressed && (
              <Box id="progressionToProgressed" title="Progression → progression">
                <TransitAspectTable
                  rows={progressionToProgressedForView(progressed.toProgressed, settings, "table").map(
                    (a) => ({ ...a, moving: a.a, other: a.b }),
                  )}
                  labels={["Progression", "Progression"]}
                  settings={settings}
                  at={live.at.utc}
                  findPasses={(row) =>
                    api.progressionPasses({
                      birth,
                      progressed: row.moving,
                      other: { progressed: row.other as Body },
                      kind: row.kind,
                      at: live.at.utc,
                      zone,
                      angleMethod,
                    })
                  }
                  onGoTo={goTo}
                />
              </Box>
            )}

            {showTransits && groups.toNatal && (
              <Box id="transitToNatal" title="Transit → natal">
                <TransitAspectTable
                  rows={transitToNatalForView(live.toNatal, settings, "table", planets).map((a) => ({
                    ...a,
                    moving: a.transit,
                    other: a.natal,
                  }))}
                  labels={["Transit", "Natal"]}
                  settings={settings}
                  at={live.at.utc}
                  findPasses={(row) =>
                    api.transitPasses({
                      birth,
                      transit: row.moving as Body,
                      other: { natal: row.other },
                      kind: row.kind,
                      at: live.at.utc,
                      zone,
                    })
                  }
                  onGoTo={goTo}
                />
              </Box>
            )}

            {showTransits && groups.toTransit && (
              <Box id="transitToTransit" title="Transit → transit">
                <TransitAspectTable
                  rows={transitToTransitForView(live.toTransit, settings, "table", planets).map(
                    (a) => ({ ...a, moving: a.a, other: a.b }),
                  )}
                  labels={["Transit", "Transit"]}
                  settings={settings}
                  at={live.at.utc}
                  findPasses={(row) =>
                    api.transitPasses({
                      birth,
                      transit: row.moving as Body,
                      other: { transit: row.other as Body },
                      kind: row.kind,
                      at: live.at.utc,
                      zone,
                    })
                  }
                  onGoTo={goTo}
                />
              </Box>
            )}

            {progressed && (
              <Box id="progressedPositions" title="Progressive positioner">
                <table className="positions-table">
                  <thead>
                    <tr>
                      <th colSpan={2}></th>
                      <th colSpan={3}>Position</th>
                      <th></th>
                      {!live.timeAssumed && <th title="Natalhoroskopets hus">Natalhus</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {progressed.positions.map((p) => (
                      <tr key={p.body}>
                        <td className="glyph" style={{ color: settings.colors.bodies[p.body] }}>
                          {POINT_GLYPHS[p.body]}
                        </td>
                        <td>{POINT_NAMES[p.body]}</td>
                        <td className="number">{formatDegree(p)}</td>
                        <td className="glyph">{SIGN_GLYPHS[p.sign]}</td>
                        <td>{SIGN_NAMES[p.sign]}</td>
                        <td className="retro" title={p.retrograde ? "Retrograd" : undefined}>
                          {p.retrograde ? "R" : ""}
                        </td>
                        {!live.timeAssumed && <td className="number">{p.house}</td>}
                      </tr>
                    ))}
                    {progressedAngles.map(([id, angle]) => (
                      <tr key={id}>
                        <td className="angle-label">{POINT_GLYPHS[id]}</td>
                        <td>{POINT_NAMES[id]}</td>
                        <td className="number">{formatDegree(angle)}</td>
                        <td className="glyph">{SIGN_GLYPHS[angle.sign]}</td>
                        <td>{SIGN_NAMES[angle.sign]}</td>
                        <td></td>
                        <td className="number">{angle.house}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="muted legend">
                  {live.timeAssumed
                    ? "Fødselstiden er ukendt, så kl. 12:00 er anvendt. Progressiv ASC/MC, husplaceringer og akseaspekter er udeladt; især Månens position afhænger af klokkeslættet."
                    : `Husene er natalhoroskopets heltegnshuse. Progressiv ASC/MC: ${
                        angleMethod === "naibodRightAscension"
                          ? "Naibod i rektascension"
                          : "Naibod i ekliptisk længde"
                      }.`}
                </p>
              </Box>
            )}

            {showTransits && (
              <Box id="transitPositions" title="Transitpositioner">
                <table className="positions-table">
                  <thead>
                    <tr>
                      <th colSpan={2}></th>
                      <th colSpan={3}>Position</th>
                      <th></th>
                      <th title="Natalhoroskopets hus">Natalhus</th>
                    </tr>
                  </thead>
                  <tbody>
                    {live.positions.map((p) => (
                      <tr key={p.body}>
                        <td className="glyph" style={{ color: settings.colors.bodies[p.body] }}>
                          {POINT_GLYPHS[p.body]}
                        </td>
                        <td>{POINT_NAMES[p.body]}</td>
                        <td className="number">{formatDegree(p)}</td>
                        <td className="glyph">{SIGN_GLYPHS[p.sign]}</td>
                        <td>{SIGN_NAMES[p.sign]}</td>
                        <td className="retro" title={p.retrograde ? "Retrograd" : undefined}>
                          {p.retrograde ? "R" : ""}
                        </td>
                        <td className="number">{p.house}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Box>
            )}

            <Box id="natal" title="Natalhoroskopet med den viste fødselstid">
              <PositionsTable chart={natal.chart} settings={settings} />
              {natal.lots && <LotsTable lots={natal.lots.positions} settings={settings} />}
            </Box>
            {changed && <ChartAnalysisPanel record={working} />}
            {changed && <ConditionPanel record={working} />}
            <LifeEventsPanel record={record} onJump={goTo} jumpLabel="Gå til" prefill={eventPrefill} />
        </PanelBoard>
      )}
    </div>
  );
}
