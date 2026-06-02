import { Board } from "../board";
import { axialToPixel, HexLayout } from "../hex";
import { hexCorner, hexPath } from "./primitives";
import { buildings, vertexKey } from "../game/buildings";
import { tileRevealProgress } from "../animation/reveal";
import { getViewerPlayerId } from "../game/players";

export type FogOpts = { enabled: boolean; color: string; opacity: number };

// Dim tiles that won't yield resources to the viewing player — any non-desert
// tile with no settlement/city owned by the viewer on any of its 6 corners.
// Honored in both face-up and face-down states so the player can plan
// settlement positions even before the board is revealed.
export function drawResourceFog(
  ctx: CanvasRenderingContext2D,
  board: Board,
  layout: HexLayout,
  opts: FogOpts,
  now: number,
) {
  if (!opts.enabled || opts.opacity <= 0) return;
  const s = layout.size;
  const total = board.tiles.length;
  const viewerId = getViewerPlayerId();
  ctx.save();
  ctx.globalAlpha = opts.opacity;
  ctx.fillStyle = opts.color;
  for (let i = 0; i < board.tiles.length; i++) {
    const tile = board.tiles[i];
    const { x, y } = axialToPixel(tile, layout);
    if (tile.type === "desert") {
      // Desert never yields, so it's pointless to dim it while the board is
      // face-up. Tint it only while the tile hasn't finished flipping yet.
      const p = tileRevealProgress(i, now, total);
      if (p >= 0.5) continue;
    } else {
      let yielding = false;
      for (let c = 0; c < 6; c++) {
        const [cx, cy] = hexCorner(x, y, s, c);
        const rec = buildings.get(vertexKey(cx, cy));
        if (rec && rec.ownerId === viewerId) { yielding = true; break; }
      }
      if (yielding) continue;
    }
    hexPath(ctx, x, y, s);
    ctx.fill();
  }
  ctx.restore();
}
