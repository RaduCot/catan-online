// Tile sheen — a brief white pulse painted over a producing tile when its
// resources fly out. Keyed by tile index → start time (ms).
export const TILE_SHEEN_DURATION = 700;
export const tileSheen = new Map<number, number>();
export function tileSheenAnimationRunning() {
  return tileSheen.size > 0;
}
