import { Board } from "../board";
import { axialToPixel, HexLayout } from "../hex";
import { hexPath } from "./primitives";
import { tileSheen, TILE_SHEEN_DURATION } from "../animation/tile-sheen";

export function drawTileSheen(
  ctx: CanvasRenderingContext2D,
  board: Board,
  layout: HexLayout,
  now: number,
) {
  if (!tileSheen.size) return;
  for (const [idx, startMs] of [...tileSheen]) {
    const t = (now - startMs) / TILE_SHEEN_DURATION;
    if (t < 0) continue;
    if (t >= 1) { tileSheen.delete(idx); continue; }
    const tile = board.tiles[idx];
    if (!tile) { tileSheen.delete(idx); continue; }
    const { x, y } = axialToPixel(tile, layout);
    // 0 → peak → 0 sine bell, capped opacity.
    const alpha = Math.sin(t * Math.PI) * 0.45;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    hexPath(ctx, x, y, layout.size * 0.98);
    ctx.fill();
    ctx.restore();
  }
}
