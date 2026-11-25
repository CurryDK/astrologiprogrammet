import { useEffect, useState } from "react";
import { api } from "./api";
import { birthInputOf, type CastSource, type ChartRecord, type ConditionReport } from "./astro";
import { useSettings } from "./settings";

// Chart Analysis and Planetary Condition show the same report, so the two
// panels of one chart share one calculation instead of asking twice.
const pending = new Map<string, Promise<ConditionReport>>();

function reportFor(key: string, load: () => Promise<ConditionReport>): Promise<ConditionReport> {
  let promise = pending.get(key);
  if (!promise) {
    if (pending.size >= 8) pending.clear();
    promise = load();
    pending.set(key, promise);
    promise.catch(() => pending.delete(key));
  }
  return promise;
}

/**
 * The Planetary Condition report of a chart with the limits in force and
 * the chart's manual sect. Both overviews read it, which is what keeps
 * them one set of rules.
 */
export function useConditionReport(source: ChartRecord | CastSource): {
  report: ConditionReport | null;
  error: string | null;
} {
  const { settings } = useSettings();
  const { cazimi, combust, beams } = settings.condition;
  const [report, setReport] = useState<ConditionReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A natal chart is calculated from its birth data; a cast chart (a Solar
  // Return) from its own moment and place.
  const cast = "utc" in source ? source : null;
  const birth = cast ? null : birthInputOf(source as ChartRecord);
  const key = JSON.stringify([cast ?? birth, source.sectOverride, cazimi, combust, beams]);

  useEffect(() => {
    let cancelled = false;
    const limits = { cazimi, combust, beams };
    reportFor(key, () =>
      cast
        ? api.planetaryConditionAt(
            {
              utc: cast.utc,
              latitude: cast.latitude,
              longitude: cast.longitude,
              zone: cast.zone,
              offsetSeconds: cast.offsetSeconds,
            },
            cast.sectOverride,
            limits,
          )
        : api.planetaryCondition(birth!, source.sectOverride, limits),
    )
      .then((result) => {
        if (cancelled) return;
        setReport(result);
        setError(null);
      })
      .catch((reason) => {
        if (!cancelled) setError(String(reason));
      });
    return () => {
      cancelled = true;
    };
    // `key` holds everything the calculation depends on.
  }, [key]);

  return { report, error };
}
