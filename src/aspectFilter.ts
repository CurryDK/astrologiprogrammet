import { isBody, type Aspect } from "./astro";
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
