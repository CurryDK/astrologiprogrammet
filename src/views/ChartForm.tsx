import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api";
import {
  countryName,
  formatOffset,
  parseOffset,
  type ChartRecord,
  type Folder,
  type Place,
  type ResolvedTime,
} from "../astro";

type Props = {
  /** The chart being edited, or null for a new one. */
  initial: ChartRecord | null;
  folders: Folder[];
  /** Folder preselected for a new chart. */
  defaultFolderId: number | null;
  onSaved: (record: ChartRecord) => void;
  onCancel: () => void;
};

// The bundled ephemeris files cover these years.
const MIN_DATE = "1800-01-01";
const MAX_DATE = "2399-12-31";

/** Birth data entry for a new or existing natal chart. */
export function ChartForm({ initial, folders, defaultFolderId, onSaved, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [date, setDate] = useState(initial?.birthDate ?? "");
  const [time, setTime] = useState(initial?.birthTime ?? "");
  const [timeUnknown, setTimeUnknown] = useState(initial ? initial.birthTime === null : false);
  const [placeName, setPlaceName] = useState(initial?.placeName ?? "");
  const [countryCode, setCountryCode] = useState(initial?.countryCode ?? null);
  const [latitude, setLatitude] = useState(initial ? String(initial.latitude) : "");
  const [longitude, setLongitude] = useState(initial ? String(initial.longitude) : "");
  const [zone, setZone] = useState(initial?.zone ?? "");
  const [manualOffset, setManualOffset] = useState(
    initial?.offsetSeconds != null ? formatOffset(initial.offsetSeconds) : "",
  );
  const [useManualOffset, setUseManualOffset] = useState(initial?.offsetSeconds != null);
  const [folderId, setFolderId] = useState(initial ? initial.folderId : defaultFolderId);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [resolved, setResolved] = useState<ResolvedTime | null>(null);
  const [timeError, setTimeError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Place search, a moment after typing stops.
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .placesSearch(query)
        .then((found) => {
          if (!cancelled) setResults(found);
        })
        .catch(console.error);
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const lat = Number(latitude.replace(",", "."));
  const lon = Number(longitude.replace(",", "."));
  const coordinatesValid =
    latitude.trim() !== "" &&
    longitude.trim() !== "" &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180;
  const offsetSeconds = useManualOffset ? parseOffset(manualOffset) : null;
  const zoneReady = useManualOffset ? offsetSeconds !== null : zone.trim() !== "";
  const birthTime = timeUnknown || time === "" ? null : time;

  // Show which UTC offset the entered date, time and place lead to.
  useEffect(() => {
    setResolved(null);
    setTimeError(null);
    if (!date || !zoneReady) return;
    let cancelled = false;
    api
      .birthResolve({
        date,
        time: birthTime,
        latitude: 0,
        longitude: 0,
        zone: useManualOffset ? null : zone.trim(),
        offsetSeconds,
      })
      .then((result) => {
        if (!cancelled) setResolved(result);
      })
      .catch((reason) => {
        if (!cancelled) setTimeError(String(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [date, birthTime, zone, useManualOffset, offsetSeconds, zoneReady]);

  function choosePlace(place: Place) {
    setPlaceName(place.name);
    setCountryCode(place.countryCode);
    setLatitude(String(place.latitude));
    setLongitude(String(place.longitude));
    setZone(place.zone);
    setQuery("");
    setResults([]);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const problems = [];
    if (!name.trim()) problems.push("navn");
    if (!date) problems.push("fødselsdato");
    if (!timeUnknown && time === "") problems.push("klokkeslæt (eller markér det som ukendt)");
    if (!placeName.trim()) problems.push("stednavn");
    if (!coordinatesValid) problems.push("gyldige koordinater");
    if (!zoneReady) problems.push(useManualOffset ? "gyldig UTC-forskel" : "tidszone");
    if (problems.length > 0) {
      setFormError(`Mangler: ${problems.join(", ")}.`);
      return;
    }
    if (timeError) {
      setFormError(timeError);
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const saved = await api.chartSave({
        id: initial?.id ?? null,
        name: name.trim(),
        folderId,
        birthDate: date,
        birthTime,
        placeName: placeName.trim(),
        countryCode,
        latitude: lat,
        longitude: lon,
        zone: zone.trim() || null,
        offsetSeconds,
        featured: initial?.featured ?? false,
      });
      onSaved(saved);
    } catch (reason) {
      setFormError(String(reason));
      setSaving(false);
    }
  }

  return (
    <form className="chart-form" onSubmit={submit}>
      <h1>{initial ? "Rediger horoskop" : "Nyt horoskop"}</h1>

      <label>
        Navn
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </label>

      <div className="row">
        <label>
          Fødselsdato
          <input
            type="date"
            min={MIN_DATE}
            max={MAX_DATE}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label>
          Klokkeslæt
          <input
            type="time"
            value={timeUnknown ? "" : time}
            disabled={timeUnknown}
            onChange={(e) => setTime(e.target.value)}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={timeUnknown}
            onChange={(e) => setTimeUnknown(e.target.checked)}
          />
          Ukendt tidspunkt (kl. 12:00 anvendes)
        </label>
      </div>

      <fieldset>
        <legend>Fødested</legend>
        <label>
          Søg efter by
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Skriv et bynavn …"
          />
        </label>
        {results.length > 0 && (
          <ul className="place-results">
            {results.map((place) => (
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

        <div className="row">
          <label className="grow">
            Stednavn
            <input value={placeName} onChange={(e) => setPlaceName(e.target.value)} />
          </label>
          <label>
            Breddegrad (nord +)
            <input
              inputMode="decimal"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
            />
          </label>
          <label>
            Længdegrad (øst +)
            <input
              inputMode="decimal"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
            />
          </label>
        </div>

        <div className="row">
          <label className="grow">
            Tidszone
            <input
              value={zone}
              disabled={useManualOffset}
              onChange={(e) => setZone(e.target.value)}
              placeholder="f.eks. Europe/Copenhagen"
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={useManualOffset}
              onChange={(e) => setUseManualOffset(e.target.checked)}
            />
            Angiv UTC-forskel selv
          </label>
          {useManualOffset && (
            <label>
              UTC-forskel
              <input
                value={manualOffset}
                onChange={(e) => setManualOffset(e.target.value)}
                placeholder="+01:00"
              />
            </label>
          )}
        </div>

        <p className="resolved">
          {resolved && (
            <>
              Anvendt UTC-forskel: <strong>{formatOffset(resolved.offsetSeconds)}</strong>
              {resolved.ambiguous &&
                " — klokkeslættet forekom to gange den dag; det første anvendes."}
            </>
          )}
          {timeError && <span className="error">{timeError}</span>}
        </p>
      </fieldset>

      <label>
        Mappe
        <select
          value={folderId ?? ""}
          onChange={(e) => setFolderId(e.target.value === "" ? null : Number(e.target.value))}
        >
          <option value="">Ingen mappe</option>
          {folders.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {folder.name}
            </option>
          ))}
        </select>
      </label>

      {formError && <p className="error">{formError}</p>}

      <div className="actions">
        <button type="submit" className="primary" disabled={saving}>
          Gem
        </button>
        <button type="button" onClick={onCancel}>
          Annuller
        </button>
      </div>
    </form>
  );
}
