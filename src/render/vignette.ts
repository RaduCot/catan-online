import { Board } from "../board";
import { hexBounds, HexLayout } from "../hex";
import { parseHexRgb } from "../utils/color";

export type VignetteOpts = {
  enabled: boolean;
  color: string;
  intensity: number;
  feather: number;
  scale: number;
};

// Circular vignette anchored to the play area. Radius matches the playable
// bbox + a slack for pan freedom; feather controls how soft the falloff is,
// intensity controls the maximum opacity at the outer edge.
export function drawVignette(
  ctx: CanvasRenderingContext2D,
  board: Board,
  layout: HexLayout,
  opts: VignetteOpts,
) {
  if (!opts.enabled || opts.intensity <= 0) return;
  const all = [...board.tiles, ...board.oceans];
  if (!all.length) return;
  const bbox = hexBounds(all, layout);
  const cx = (bbox.minX + bbox.maxX) / 2;
  const cy = (bbox.minY + bbox.maxY) / 2;
  // Diameter as big as the play area + pan slack — `panSlack` is the fraction
  // of the board that can drift off-screen per side (1 - PAN_KEEP_VISIBLE).
  // Radius = half the board's longer dimension, multiplied by user `scale`.
  // scale=1 means the vignette circle fits the board exactly; >1 extends it
  // into the pannable surroundings.
  const r1 = (Math.max(bbox.width, bbox.height) / 2) * opts.scale;
  const r0 = r1 * (1 - opts.feather);
  const rgb = parseHexRgb(opts.color);
  const grad = ctx.createRadialGradient(cx, cy, r0, cx, cy, r1);
  grad.addColorStop(0, `rgba(${rgb.join(",")},0)`);
  grad.addColorStop(1, `rgba(${rgb.join(",")},${opts.intensity})`);
  const t = ctx.getTransform();
  const inv = t.inverse();
  const tl = inv.transformPoint(new DOMPoint(0, 0));
  const br = inv.transformPoint(new DOMPoint(ctx.canvas.width, ctx.canvas.height));
  const x = Math.min(tl.x, br.x), y = Math.min(tl.y, br.y);
  const w = Math.abs(br.x - tl.x), h = Math.abs(br.y - tl.y);
  ctx.save();
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}
