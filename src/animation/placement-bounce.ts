import { easeOutBack } from "../utils/easing";

// Per-piece placement bounce. Keyed by vertex/edge key → spawn time (ms). The
// piece pops in from scale 0 with easeOutBack so building feels satisfying.
export const PLACEMENT_BOUNCE_DURATION = 450;
export const placementBounce = new Map<string, number>();
export function placementBounceScale(key: string, now: number): number {
  const start = placementBounce.get(key);
  if (start == null) return 1;
  const t = (now - start) / PLACEMENT_BOUNCE_DURATION;
  if (t >= 1) { placementBounce.delete(key); return 1; }
  if (t <= 0) return 0;
  return Math.max(0, easeOutBack(t));
}
export function placementBounceAnimationRunning() {
  return placementBounce.size > 0;
}
