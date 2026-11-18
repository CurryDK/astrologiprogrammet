import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { aspectsForView } from "../aspectFilter";
import { localZone, type SkyAt, type TimeStep } from "../astro";
import { AspectTable } from "../components/AspectTable";
import { ChartWheel } from "../components/ChartWheel";
import { Box, PanelBoard, ResetLayoutButton } from "../components/PanelBoard";
import { PositionsTable } from "../components/PositionsTable";
import { TimeNavigator } from "../components/TimeNavigator";
import { useSettings } from "../settings";
import { HOME } from "./StartView";

/**
 * A transit chart on its own (specification §8): the sky now or at any
 * chosen date and time, moved by hand with the time navigation.
 */
export function TransitView() {
  const { settings, update } = useSettings();
  const zone = localZone();
  const [sky, setSky] = useState<SkyAt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shownAt = useRef<string | null>(null);
  const busy = useRef(false);

  const load = useCallback(
    async (at: string | null, step: TimeStep | null) => {
      if (busy.current && step) return;
      busy.current = true;
      try {
        const result = await api.skyAt({
          at,
          step,
          zone,
          latitude: HOME.latitude,
          longitude: HOME.longitude,
          orbs: settings.orbs,
        });
        shownAt.current = result.at.utc;
        setSky(result);
        setError(null);
      } catch (reason) {
        setError(String(reason));
      } finally {
        busy.current = false;
      }
    },
    [zone, settings.orbs],
  );

  useEffect(() => {
    load(shownAt.current, null);
  }, [load]);

  return (
    <div className="chart-view">
      {error && <p className="error">Beregningen mislykkedes: {error}</p>}

      {sky && (
        <>
          <section className="panel time-panel">
            <TimeNavigator
              at={sky.at}
              zone={zone}
              note={`Himlen på et valgt tidspunkt · akser og huse set fra ${HOME.name}`}
              unit={settings.transits.stepUnit}
              onUnit={(stepUnit) =>
                update((s) => ({ ...s, transits: { ...s.transits, stepUnit } }))
              }
              onStep={(direction) =>
                load(shownAt.current, { unit: settings.transits.stepUnit, count: direction })
              }
              onNow={() => load(null, null)}
              onGoTo={(utc) => load(utc, null)}
              extra={<ResetLayoutButton view="transit" />}
            />
          </section>
          <PanelBoard
            view="transit"
            wheel={(room) => (
              <ChartWheel
                chart={sky.computed.chart}
                aspects={aspectsForView(sky.computed.aspects, settings, "wheel")}
                settings={settings}
                room={room}
              />
            )}
          >
            <Box id="positions" title="Positioner">
              <PositionsTable chart={sky.computed.chart} settings={settings} />
            </Box>
            <Box id="aspects" title="Aspekter">
              <AspectTable
                aspects={aspectsForView(sky.computed.aspects, settings, "table")}
                settings={settings}
              />
            </Box>
          </PanelBoard>
        </>
      )}
    </div>
  );
}
