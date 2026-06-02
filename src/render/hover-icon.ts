import { Board, TileType } from "../board";
import { axialToPixel, HexLayout } from "../hex";
import { parseHexRgb } from "../utils/color";

// Mouse-hover icon overlay state. Tracks the currently-hovered land tile and a
// smoothly tweened display alpha so the icon fades in on entry and out on exit.
export type HoverState = {
  idx: number;        // tile whose icon is currently being displayed (-1 = none)
  pending: number;    // tile we want to switch to once the current one finishes fading out
  alpha: number;      // current display alpha (0–1)
  target: number;     // alpha we're tweening toward (0 or 1)
};
export const hover: HoverState = { idx: -1, pending: -1, alpha: 0, target: 0 };

export type HoverOpts = {
  enabled: boolean;
  color: string;
  offX: number; offY: number;
  scale: number;
  opacity: number;
  fadeIn: number;
  fadeOut: number;
  glowSize: number;
  feather: number;
  blend: GlobalCompositeOperation;
};

export function drawHoverIcon(
  ctx: CanvasRenderingContext2D,
  board: Board,
  layout: HexLayout,
  portIcons: Partial<Record<TileType, HTMLImageElement>>,
  opts: HoverOpts
) {
  if (!opts.enabled || hover.idx < 0 || hover.alpha <= 0) return;
  const tile = board.tiles[hover.idx];
  if (!tile || tile.type === "desert") return;
  const icon = portIcons[tile.type];
  if (!icon) return;
  const s = layout.size;
  const { x, y } = axialToPixel(tile, layout);
  const cx = x + opts.offX * s;
  const cy = y + opts.offY * s;
  const iconSize = s * opts.scale;
  const glowR = iconSize * opts.glowSize;
  const a = hover.alpha * opts.opacity;

  // Radial glow behind the icon — color exposed as a control.
  const [gr, gg, gb] = parseHexRgb(opts.color);
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
  const innerStop = Math.max(0, 1 - opts.feather);
  grad.addColorStop(0, `rgba(${gr},${gg},${gb},${a})`);
  grad.addColorStop(innerStop, `rgba(${gr},${gg},${gb},${a * 0.6})`);
  grad.addColorStop(1, `rgba(${gr},${gg},${gb},0)`);
  ctx.save();
  ctx.globalCompositeOperation = opts.blend;
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Icon
  ctx.globalAlpha = hover.alpha;
  ctx.drawImage(icon, cx - iconSize / 2, cy - iconSize / 2, iconSize, iconSize);
  ctx.globalAlpha = 1;
}

// Cursor over the number token's disk specifically. The resource-preview
// hover uses this so it only fires when the player points at the chance
// number rather than anywhere on the tile.
export function findHoveredNumberTokenTileIdx(
  board: Board,
  layout: HexLayout,
  view: { tx: number; ty: number; zoom: number },
  mx: number,
  my: number,
  numOpts: { scale: number; offX: number; offY: number },
): number {
  const wx = (mx - view.tx) / view.zoom;
  const wy = (my - view.ty) / view.zoom;
  const r = layout.size * numOpts.scale;
  const ox = layout.size * numOpts.offX;
  const oy = layout.size * numOpts.offY;
  for (let i = 0; i < board.tiles.length; i++) {
    const tile = board.tiles[i];
    if (tile.number == null) continue;
    const p = axialToPixel(tile, layout);
    if (Math.hypot(wx - (p.x + ox), wy - (p.y + oy)) <= r) return i;
  }
  return -1;
}
