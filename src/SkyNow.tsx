import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  BODY_GLYPHS,
  BODY_NAMES,
  SIGN_GLYPHS,
  SIGN_NAMES,
  formatDegree,
  type Chart,
} from "./astro";

// Until places can be chosen, the sky is shown for Copenhagen. Planet
// positions are the same everywhere on Earth to well within an arc-minute
// (the Moon within about a degree); only angles and houses depend on place,
// and those are not shown here.
const COPENHAGEN = { latitude: 55.6761, longitude: 12.5683 };
const REFRESH_MS = 60_000;

const timeFormat = new Intl.DateTimeFormat("da-DK", {
  dateStyle: "long",
  timeStyle: "short",
});

/** "Himlen lige nu": current positions, refreshed every minute. */
export function SkyNow() {
  const [chart, setChart] = useState<Chart | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      invoke<Chart>("sky_now", COPENHAGEN)
        .then((result) => {
          if (cancelled) return;
          setChart(result);
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
  }, []);

  return (
    <section className="sky-now">
      <h2>Himlen lige nu</h2>
      {error && <p className="error">Beregningen mislykkedes: {error}</p>}
      {chart && (
        <>
          <p className="when">{timeFormat.format(new Date(chart.utc))}</p>
          <table>
            <tbody>
              {chart.positions.map((p) => (
                <tr key={p.body}>
                  <td className="glyph">{BODY_GLYPHS[p.body]}</td>
                  <td>{BODY_NAMES[p.body]}</td>
                  <td className="degree">{formatDegree(p)}</td>
                  <td className="glyph">{SIGN_GLYPHS[p.sign]}</td>
                  <td>{SIGN_NAMES[p.sign]}</td>
                  <td className="retro">{p.retrograde ? "R" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
