import { Board, TileType } from "../board";
import { axialToPixel, HexLayout } from "../hex";
import { parseHexRgb } from "../utils/color";
import { hexCorner, hexPath } from "./primitives";

export type PortOpts = {
  glowColor: string;
  glowSize: number;
  glowFeather: number;
  glowOpacity: number;
  glowBlend: GlobalCompositeOperation;
  centerOffset: number;
  itemsGap: number;
  iconSize: number;
  textSize: number;
};

export function drawPorts(ctx: CanvasRenderingContext2D, board: Board, layout: HexLayout, portIcons: Partial<Record<TileType, HTMLImageElement>>, opts: PortOpts) {
  const s = layout.size;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const o of board.oceans) {
    if (!o.port) continue;
    const { x: cx, y: cy } = axialToPixel(o, layout);
    ctx.save();
    hexPath(ctx, cx, cy, s);
    ctx.clip();
    // Edge index for the facing direction. With HEX_DIRS order
    // [E, NE, NW, W, SW, SE], the corresponding edges (corner i to corner i+1)
    // are mapped by (6 - dir) % 6 using our corner indexing (i=0 upper-right, CW).
    const edge = (6 - o.port.facing) % 6;
    const cA = hexCorner(cx, cy, s, edge);
    const cB = hexCorner(cx, cy, s, (edge + 1) % 6);

    // Edge unit vector (cA → cB) and inward perpendicular (edge midpoint → hex center).
    const eu: [number, number] = [(cB[0] - cA[0]) / s, (cB[1] - cA[1]) / s];
    const mx = (cA[0] + cB[0]) / 2, my = (cA[1] + cB[1]) / 2;
    const ivx = cx - mx, ivy = cy - my;
    const ivl = Math.hypot(ivx, ivy);
    const vp: [number, number] = [ivx / ivl, ivy / ivl];

    // Piers come out at 60° to the shared edge from each corner, meeting at the apex
    // of an equilateral-ish triangle. Bases are shifted inward along the edge by W/2
    // so the corner-side edge of each pier rectangle passes exactly through the hex corner.
    const W = Math.max(2, s * 0.08);
    const cosA = 0.5, sinA = Math.sqrt(3) / 2; // 60°
    const p1Start: [number, number] = [cA[0] + eu[0] * W / 2, cA[1] + eu[1] * W / 2];
    const p2Start: [number, number] = [cB[0] - eu[0] * W / 2, cB[1] - eu[1] * W / 2];
    const p1Dir: [number, number] = [eu[0] * cosA + vp[0] * sinA, eu[1] * cosA + vp[1] * sinA];
    const p2Dir: [number, number] = [-eu[0] * cosA + vp[0] * sinA, -eu[1] * cosA + vp[1] * sinA];
    // Both piers held at 60° to the edge but shortened — they no longer meet at
    // a shared apex; the port marker sits between the two pier endpoints.
    const pierLen = (s - W) * 0.5;
    const e1: [number, number] = [p1Start[0] + p1Dir[0] * pierLen, p1Start[1] + p1Dir[1] * pierLen];
    const e2: [number, number] = [p2Start[0] + p2Dir[0] * pierLen, p2Start[1] + p2Dir[1] * pierLen];

    // Marker sits between the two pier endpoints but pushed toward the hex center
    // by `centerOffset` (in hex sizes).
    const labelShift = s * opts.centerOffset;
    const px = (e1[0] + e2[0]) / 2 + vp[0] * labelShift;
    const py = (e1[1] + e2[1]) / 2 + vp[1] * labelShift;
    const r = s * 0.22;

    ctx.strokeStyle = "#b88a4a";
    ctx.lineCap = "butt";
    ctx.lineWidth = W;
    // Extend each pier backward past the hex edge; ocean clipping cuts the overshoot
    // so the pier appears to terminate flush along the land border.
    const overshoot = s * 0.4;
    const pairs: { start: [number, number]; dir: [number, number]; end: [number, number] }[] = [
      { start: p1Start, dir: p1Dir, end: e1 },
      { start: p2Start, dir: p2Dir, end: e2 },
    ];
    for (const { start, dir, end } of pairs) {
      const ex = start[0] - dir[0] * overshoot;
      const ey = start[1] - dir[1] * overshoot;
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(end[0], end[1]);
      ctx.stroke();
    }

    // Radial glow behind the group — color/size/feather/opacity/blend exposed.
    {
      const [gr, gg, gb] = parseHexRgb(opts.glowColor);
      const glowR = r * opts.glowSize;
      const innerStop = Math.max(0, 1 - opts.glowFeather);
      const a = opts.glowOpacity;
      const glow = ctx.createRadialGradient(px, py, 0, px, py, glowR);
      glow.addColorStop(0, `rgba(${gr},${gg},${gb},${a})`);
      glow.addColorStop(innerStop, `rgba(${gr},${gg},${gb},${a * 0.55})`);
      glow.addColorStop(1, `rgba(${gr},${gg},${gb},0)`);
      ctx.save();
      ctx.globalCompositeOperation = opts.glowBlend;
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(px, py, glowR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Marker — icon on top, ratio text below. Item positions derived from
    // `itemsGap` (centre-to-centre distance between icon and text, in units of r).
    const type = o.port.type;
    const halfGap = (opts.itemsGap / 2) * r;
    ctx.fillStyle = "#fff";
    if (type === "3:1") {
      ctx.font = `bold ${r * opts.textSize * 1.2}px system-ui, sans-serif`;
      ctx.fillText("3:1", px, py);
    } else {
      const icon = portIcons[type as TileType];
      if (icon) {
        const iconSize = r * opts.iconSize;
        ctx.drawImage(icon, px - iconSize / 2, py - halfGap - iconSize / 2, iconSize, iconSize);
      }
      ctx.font = `bold ${r * opts.textSize}px system-ui, sans-serif`;
      ctx.fillText("2:1", px, py + halfGap);
    }
    ctx.restore();
  }
  ctx.restore();
}
