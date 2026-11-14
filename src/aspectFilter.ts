import { isBody, isLot, type Aspect, type LotAspect } from "./astro";
import type { Settings } from "./settings";

/**
 * The aspects to show in one view. A body must be switched on for aspects
 * (and, in the wheel, be drawn there); aspects to the Ascendant and
 * Midheaven are switched separately for each view (specification §5).
 */
export function aspectsForView(
  aspects: Aspect[],
  settings: Settings,
  view: "wheel" | "table",
): Aspect[] {
  return aspects.filter((aspect) =>
    [aspect.a, aspect.b].every((point) =>
      isBody(point)
        ? settings.inAspects[point] && (view === "table" || settings.showInWheel[point])
        : settings.angleAspects[view][point],
    ),
  );
}

/**
 * The lot aspects to show in the lot aspect overview: to planets (those
 * switched on for aspects), to the angles and to other lots, each group
 * switched separately.
 */
export function lotAspectsForView(aspects: LotAspect[], settings: Settings): LotAspect[] {
  const { planets, angles, lots } = settings.lots.aspectsTo;
  return aspects.filter(({ other }) => {
    if (isLot(other)) return lots;
    if (isBody(other)) return planets && settings.inAspects[other];
    return angles;
  });
}
