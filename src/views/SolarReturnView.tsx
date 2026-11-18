import { useEffect, useState } from "react";
import { api } from "../api";
import { aspectsForView, lotAspectsForView } from "../aspectFilter";
import {
  LOTS,
  LOT_NAMES,
  POINT_GLYPHS,
  POINT_NAMES,
  SECT_NAMES,
  countryName,
  formatMomentLong,
  formatOffset,
  isBody,
  type Aspect,
  type CastSource,
  type ChartRecord,
  type Place,
  type ReturnChoice,
  type Sect,
  type SolarReturn,
} from "../astro";
import { AspectTable } from "../components/AspectTable";
import { ChartAnalysisPanel } from "../components/ChartAnalysisPanel";
import { ChartWheel } from "../components/ChartWheel";
import { ConditionPanel } from "../components/ConditionPanel";
import { LotAspectTable } from "../components/LotAspectTable";
import { LotSymbol, LotsTable } from "../components/LotsTable";
import { Box, PanelBoard, ResetLayoutButton } from "../components/PanelBoard";
import { PositionsTable } from "../components/PositionsTable";
import { useSettings } from "../settings";

type Props = {
  record: ChartRecord;
  onBack: () => void;
};

/**
 * Solar Return of a natal chart (specification §10 and the decisions of
 * 14 and 18 November 2026): its own wheel, positions, aspects, lots and
 * Planetary Condition, all from the return chart alone. It opens on the
 * return in force and steps between years. Without a birth time only
 * positions and aspects are shown. Draws only; the backend decides.
 */
export function SolarReturnView({ record, onBack }: Props) {
  const { settings, update } = useSettings();
  // The return asked for; null is the one in force now.
  const [age, setAge] = useState<number | null>(null);
  const [result, setResult] = useState<SolarReturn | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Counts the saved choices, so the return is fetched again after one.
  const [saved, setSaved] = useState(0);
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);

  useEffect(() => {
    if (record.id === null) return;
    let cancelled = false;
    api
      .solarReturn({
        chartId: record.id,
        age,
        orbs: settings.orbs,
        lotOrb: settings.lots.orb,
        lotExactOrb: settings.lots.exactOrb,
      })
      .then((value) => {
        if (cancelled) return;
        setResult(value);
        setError(null);
      })
      .catch((reason) => {
        if (!cancelled) setError(String(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [record, age, saved, settings.orbs, settings.lots.orb, settings.lots.exactOrb]);

  // Place search, a moment after typing stops.
  useEffect(() => {
    if (query.trim().length < 2) {
      setPlaces([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .placesSearch(query)
        .then((found) => {
          if (!cancelled) setPlaces(found);
        })
        .catch(console.error);
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  /** Stores a choice for the shown year only, then shows the return again. */
  async function choose(change: Partial<ReturnChoice>) {
    if (!result || record.id === null) return;
    const current: ReturnChoice = {
      place:
        result.place.changed && result.place.zone !== null
          ? {
              name: result.place.name,
              countryCode: result.place.countryCode,
              latitude: result.place.latitude,
              longitude: result.place.longitude,
              zone: result.place.zone,
            }
          : null,
      sectOverride: result.sectOverride,
    };
    try {
      await api.solarReturnSet(record.id, result.age, { ...current, ...change });
      setSaved((count) => count + 1);
    } catch (reason) {
      setError(String(reason));
    }
  }

  function choosePlace(place: Place) {
    setQuery("");
    setPlaces([]);
    choose({
      place: {
        name: place.name,
        countryCode: place.countryCode,
        latitude: place.latitude,
        longitude: place.longitude,
        zone: place.zone,
      },
    });
  }

  const limited = result?.timeAssumed ?? false;
  const computed = result?.computed;
  // Without a birth time there are no angles to make aspects to.
  const withoutAngles = (aspects: Aspect[]) =>
    limited ? aspects.filter((aspect) => isBody(aspect.a) && isBody(aspect.b)) : aspects;
  const wheelSettings = {
    ...settings,
    lots: { ...settings.lots, showInWheel: settings.solarReturn.lotsInWheel },
  };
  const cast: CastSource | null = result
    ? {
        utc: result.moment.utc,
        latitude: result.place.latitude,
        longitude: result.place.longitude,
        zone: result.place.zone,
        offsetSeconds: result.place.offsetSeconds,
        sectOverride: result.sectOverride,
      }
    : null;
  const setLotsInWheel = (change: (current: typeof settings.solarReturn.lotsInWheel) => typeof settings.solarReturn.lotsInWheel) =>
    update((s) => ({ ...s, solarReturn: { ...s.solarReturn, lotsInWheel: change(s.solarReturn.lotsInWheel) } }));

  return (
    <div className="chart-view">
      <header className="chart-header">
        <div className="chart-title">
          <h1>
            {record.name} · Solar Return{result ? ` ${result.moment.local.slice(0, 4)}` : ""}
          </h1>
          {result && (
            <p className="muted">
              {formatMomentLong(result.moment)}:{result.moment.local.slice(17, 19)} ·{" "}
              {[result.place.name, countryName(result.place.countryCode)].filter(Boolean).join(", ")}
              {result.place.changed && " (valgt sted)"} · UTC{formatOffset(result.moment.offsetSeconds)}
              {" · "}alder {result.age}
              {result.age === result.activeAge && " · det aktive Solar Return"}
              {computed?.lots && ` · ${SECT_NAMES[computed.lots.sect]}`}
              {computed?.lots?.overridden && " (valgt manuelt)"}
            </p>
          )}
          {result?.timeLord && (
            <p className="muted">
              Årets Time Lord (natal profektion):{" "}
              <span className="glyph-inline" style={{ color: settings.colors.bodies[result.timeLord] }}>
                {POINT_GLYPHS[result.timeLord]}
              </span>{" "}
              {POINT_NAMES[result.timeLord]}
            </p>
          )}
          {limited && (
            <p className="notice">
              Fødselstidspunktet er ukendt. Dette Solar Return er beregnet med kl. 12:00 som antaget
              fødselstid, så return-tidspunktet kan afvige omkring et halvt døgn. Planetpositioner og
              aspekter er derfor usikre, og Månen kan stå flere grader anderledes. Akser, huse, lots,
              sect og Planetary Condition vises ikke.
            </p>
          )}
        </div>
        <div className="actions">
          <button
            disabled={!result || result.age <= 0}
            onClick={() => result && setAge(result.age - 1)}
            title="Solar Return året før"
          >
            ◀ Forrige år
          </button>
          <button
            disabled={!result || result.age === result.activeAge}
            onClick={() => setAge(null)}
            title="Det senest indtrufne Solar Return"
          >
            Aktuelt
          </button>
          <button onClick={() => result && setAge(result.age + 1)} disabled={!result} title="Solar Return året efter">
            Næste år ▶
          </button>
          <button onClick={onBack}>Natalhoroskop</button>
          <ResetLayoutButton view="solarReturn" />
        </div>
      </header>

      {error && <p className="error">Beregningen mislykkedes: {error}</p>}

      {result && computed && cast && (
        <PanelBoard
          view="solarReturn"
          wheel={(room) => (
            <ChartWheel
              chart={computed.chart}
              aspects={withoutAngles(aspectsForView(computed.aspects, settings, "wheel"))}
              settings={wheelSettings}
              lots={computed.lots?.positions}
              room={room}
              withoutAngles={limited}
            />
          )}
        >
          <Box id="place" title="Sted">
            <p>
              {[result.place.name, countryName(result.place.countryCode)].filter(Boolean).join(", ")}
              <span className="muted">
                {" "}
                · {result.place.changed ? "valgt for dette år" : "fødestedet"}
              </span>
            </p>
            <label>
              Skift sted for dette Solar Return
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Skriv et bynavn …" />
            </label>
            {places.length > 0 && (
              <ul className="place-results">
                {places.map((place) => (
                  <li key={`${place.name}-${place.latitude}-${place.longitude}`}>
                    <button type="button" onClick={() => choosePlace(place)}>
                      <strong>{place.name}</strong>
                      <span className="muted">
                        {[place.region, countryName(place.countryCode)].filter(Boolean).join(", ")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {result.place.changed && (
              <div className="actions">
                <button onClick={() => choose({ place: null })}>Nulstil til fødested</button>
              </div>
            )}
            <p className="muted legend">
              {limited
                ? "Stedet bestemmer her kun, hvilken lokal tid tidspunktet vises i."
                : "Akser og huse genberegnes for det valgte sted. Valget gælder kun dette år og ændrer ikke natalhoroskopets fødested."}
            </p>
          </Box>

          <Box id="positions" title="Positioner">
            <PositionsTable chart={computed.chart} settings={settings} positionsOnly={limited} />
          </Box>

          <Box id="aspects" title="Aspekter">
            <AspectTable
              aspects={withoutAngles(aspectsForView(computed.aspects, settings, "table"))}
              settings={settings}
            />
          </Box>

          {computed.lots && (
            <Box id="lots" title="Lots">
              <label className="sect-choice">
                Sect
                <select
                  aria-label="Sect"
                  value={result.sectOverride ?? ""}
                  onChange={(e) => choose({ sectOverride: (e.target.value || null) as Sect | null })}
                >
                  <option value="">
                    Automatisk ({SECT_NAMES[computed.chart.sect].toLowerCase()} ud fra Solen)
                  </option>
                  <option value="day">Dagkort (valgt manuelt)</option>
                  <option value="night">Natkort (valgt manuelt)</option>
                </select>
              </label>
              <LotsTable lots={computed.lots.positions} settings={settings} />
              <p className="muted legend">
                Sect gælder dette Solar Return alene og ændrer ikke natalhoroskopets sect.
              </p>
            </Box>
          )}

          {computed.lots && (
            <Box id="lotAspects" title="Lot-aspekter">
              <LotAspectTable
                aspects={lotAspectsForView(computed.lots.aspects, settings)}
                settings={settings}
              />
            </Box>
          )}

          {computed.lots && (
            <Box id="display" title="Visning">
              <table className="display-table">
                <thead>
                  <tr>
                    <th>Lots</th>
                    <th>
                      <label>
                        <input
                          type="checkbox"
                          aria-label="Alle lots i hjulet"
                          checked={LOTS.every((lot) => settings.solarReturn.lotsInWheel[lot])}
                          onChange={(e) =>
                            setLotsInWheel(
                              () =>
                                Object.fromEntries(
                                  LOTS.map((lot) => [lot, e.target.checked]),
                                ) as typeof settings.solarReturn.lotsInWheel,
                            )
                          }
                        />{" "}
                        I hjulet
                      </label>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {LOTS.map((lot) => (
                    <tr key={lot}>
                      <td>
                        <LotSymbol lot={lot} wheelSize /> {LOT_NAMES[lot]}
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`${LOT_NAMES[lot]} i hjulet`}
                          checked={settings.solarReturn.lotsInWheel[lot]}
                          onChange={(e) =>
                            setLotsInWheel((current) => ({ ...current, [lot]: e.target.checked }))
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted legend">
                Huskes for Solar Return for sig. Planeter og aspekter følger valgene ved
                natalhoroskopet.
              </p>
            </Box>
          )}

          {!limited && <ChartAnalysisPanel record={cast} timeLord={result.timeLord} />}
          {!limited && <ConditionPanel record={cast} timeLord={result.timeLord} />}
        </PanelBoard>
      )}
    </div>
  );
}
