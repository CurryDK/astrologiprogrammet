import { useEffect, useState } from "react";
import { api } from "./api";
import { birthInputOf, type ChartRecord, type ConditionReport } from "./astro";
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
export function useConditionReport(record: ChartRecord): {
  report: ConditionReport | null;
  error: string | null;
} {
  const { settings } = useSettings();
  const { cazimi, combust, beams } = settings.condition;
  const [report, setReport] = useState<ConditionReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const birth = birthInputOf(record);
  const key = JSON.stringify([birth, record.sectOverride, cazimi, combust, beams]);

  useEffect(() => {
    let cancelled = false;
    reportFor(key, () => api.planetaryCondition(birth, record.sectOverride, { cazimi, combust, beams }))
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { report, error };
}
