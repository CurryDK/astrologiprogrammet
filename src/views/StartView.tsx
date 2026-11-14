import { useEffect, useState } from "react";
import { api } from "../api";
import { aspectsForView } from "../aspectFilter";
import { countryName, formatBirthDate, type ChartRecord, type ComputedChart } from "../astro";
import { ChartWheel } from "../components/ChartWheel";
import { useSettings } from "../settings";

// Until a home place can be chosen, the sky is shown as seen from
// Copenhagen. Planet positions barely depend on the place; the angles and
// houses in the wheel do.
const HOME = { name: "København", latitude: 55.6761, longitude: 12.5683 };
const REFRESH_MS = 60_000;

const timeFormat = new Intl.DateTimeFormat("da-DK", { dateStyle: "long", timeStyle: "short" });

type Props = {
  charts: ChartRecord[];
  onOpen: (id: number) => void;
  onArchive: () => void;
};

/** Start screen: "Himlen lige nu" and the selected natal charts (specification §3). */
export function StartView({ charts, onOpen, onArchive }: Props) {
  const { settings } = useSettings();
  const [sky, setSky] = useState<ComputedChart | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api
        .skyNow(HOME.latitude, HOME.longitude, settings.orbs)
        .then((result) => {
          if (cancelled) return;
          setSky(result);
          setError(null);
        })
        .catch((reason) => {
          if (!cancelled) setError(String(reason));
        });
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [settings.orbs]);

  const featured = charts.filter((chart) => chart.featured);

  return (
    <div className="start">
      <section className="panel sky">
        <h2>Himlen lige nu</h2>
        {error && <p className="error">Beregningen mislykkedes: {error}</p>}
        {sky && (
          <>
            <p className="muted">
              {timeFormat.format(new Date(sky.chart.utc))} · set fra {HOME.name}
            </p>
            <ChartWheel
              chart={sky.chart}
              aspects={aspectsForView(sky.aspects, settings, "wheel")}
              settings={settings}
            />
          </>
        )}
      </section>

      <section className="panel featured">
        <h2>Udvalgte horoskoper</h2>
        {featured.length === 0 ? (
          <p className="muted">
            Ingen horoskoper er valgt endnu. Åbn et horoskop og sæt hak ved »Vis på
            startskærmen«.
          </p>
        ) : (
          <ul>
            {featured.map((chart) => (
              <li key={chart.id}>
                <button onClick={() => onOpen(chart.id!)}>
                  <strong>{chart.name}</strong>
                  <span className="muted">
                    {formatBirthDate(chart.birthDate)}
                    {chart.birthTime ? ` kl. ${chart.birthTime}` : ""} ·{" "}
                    {[chart.placeName, countryName(chart.countryCode)].filter(Boolean).join(", ")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <button onClick={onArchive}>Åbn arkivet</button>
      </section>
    </div>
  );
}
