import { Board } from "../board";
import { axialToPixel, HexLayout } from "../hex";
import { hexCorner, hexPath, HEX_DIRS } from "./primitives";

// Stroke each contiguous run of land-bordering edges as a single polyline so
// that two adjacent land edges share a clean mitered corner instead of two
// overlapping perpendicular strokes.
export function drawBeachRuns(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
  landEdge: boolean[],
  foamColor: string
) {
  if (!landEdge.some(Boolean)) return;
  // find contiguous runs of true values, with wrap-around handling
  const runs: number[][] = [];
  if (landEdge.every(Boolean)) {
    runs.push([0, 1, 2, 3, 4, 5]);
  } else {
    // start at an edge whose predecessor is false
    let start = -1;
    for (let i = 0; i < 6; i++) {
      if (landEdge[i] && !landEdge[(i + 5) % 6]) { start = i; break; }
    }
    if (start < 0) return;
    let i = start;
    let consumed = 0;
    while (consumed < 6) {
      if (landEdge[i]) {
        const run: number[] = [];
        while (landEdge[i] && run.length < 6) {
          run.push(i);
          i = (i + 1) % 6;
          consumed++;
          if (i === start) break;
        }
        runs.push(run);
      } else {
        i = (i + 1) % 6;
        consumed++;
      }
    }
  }
  const overshoot = s * 0.25;
  // Align the foam line with the sand band's outer (water-facing) edge so no
  // thin strip of sand peeks past the foam.
  const insetDist = s * 0.15;
  // For a hex (120° interior angle) the bisector-direction offset that yields
  // perpendicular distance `d` to each adjacent edge is `d * 2/√3`.
  const cornerInset = (insetDist * 2) / Math.sqrt(3);

  for (const run of runs) {
    const isRing = run.length === 6;
    // outer (on-edge) polyline; overshoot endpoints along the edge direction
    const outer: [number, number][] = [];
    const firstEdge = run[0];
    const lastEdge = run[run.length - 1];
    const [fx1, fy1] = hexCorner(cx, cy, s, firstEdge);
    const [fx2, fy2] = hexCorner(cx, cy, s, (firstEdge + 1) % 6);
    const [lx1, ly1] = hexCorner(cx, cy, s, lastEdge);
    const [lx2, ly2] = hexCorner(cx, cy, s, (lastEdge + 1) % 6);
    if (!isRing) {
      const dx = fx2 - fx1, dy = fy2 - fy1;
      const len = Math.hypot(dx, dy);
      outer.push([fx1 - (dx / len) * overshoot, fy1 - (dy / len) * overshoot]);
    }
    outer.push([fx1, fy1]);
    for (const e of run) outer.push(hexCorner(cx, cy, s, (e + 1) % 6));
    if (!isRing) {
      const dx = lx2 - lx1, dy = ly2 - ly1;
      const len = Math.hypot(dx, dy);
      outer.push([lx2 + (dx / len) * overshoot, ly2 + (dy / len) * overshoot]);
    }

    // inner (inset) polyline. Endpoints use perpendicular-to-edge inset;
    // middle corners use bisector inset toward the hex center.
    const inner: [number, number][] = [];
    const perpInward = (e: number) => {
      const [x1, y1] = hexCorner(cx, cy, s, e);
      const [x2, y2] = hexCorner(cx, cy, s, (e + 1) % 6);
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      const dx = cx - mx, dy = cy - my;
      const len = Math.hypot(dx, dy);
      return [dx / len, dy / len] as [number, number];
    };
    const radialInset = (x: number, y: number, dist: number): [number, number] => {
      const dx = cx - x, dy = cy - y;
      const len = Math.hypot(dx, dy);
      return [x + (dx / len) * dist, y + (dy / len) * dist];
    };
    if (!isRing) {
      const [nx, ny] = perpInward(firstEdge);
      const [ox, oy] = outer[0];
      inner.push([ox + nx * insetDist, oy + ny * insetDist]);
      inner.push([fx1 + nx * insetDist, fy1 + ny * insetDist]);
    } else {
      inner.push(radialInset(...outer[0], cornerInset));
    }
    for (let k = 0; k < run.length - 1; k++) {
      const ci = (run[k] + 1) % 6;
      const [x, y] = hexCorner(cx, cy, s, ci);
      inner.push(radialInset(x, y, cornerInset));
    }
    if (!isRing) {
      const [nx, ny] = perpInward(lastEdge);
      inner.push([lx2 + nx * insetDist, ly2 + ny * insetDist]);
      const [ex, ey] = outer[outer.length - 1];
      inner.push([ex + nx * insetDist, ey + ny * insetDist]);
    }

    ctx.lineCap = "butt";
    ctx.lineJoin = "miter";

    // primary sand band
    ctx.strokeStyle = "#e3c98a";
    ctx.lineWidth = s * 0.3;
    ctx.beginPath();
    ctx.moveTo(outer[0][0], outer[0][1]);
    for (let k = 1; k < outer.length; k++) ctx.lineTo(outer[k][0], outer[k][1]);
    if (isRing) ctx.closePath();
    ctx.stroke();

    // water line (foam) — drawn along the inset polyline
    ctx.strokeStyle = foamColor;
    ctx.lineWidth = s * 0.05;
    ctx.beginPath();
    ctx.moveTo(inner[0][0], inner[0][1]);
    for (let k = 1; k < inner.length; k++) ctx.lineTo(inner[k][0], inner[k][1]);
    if (isRing) ctx.closePath();
    ctx.stroke();
  }
}


export function landSilhouettePath(board: Board, layout: HexLayout): Path2D {
  const s = layout.size;
  const path = new Path2D();
  // Include both land tiles AND lake hexes so the glow doesn't bleed inward
  // into enclosed lakes — only the outer sea coast gets the halo.
  const cells = [
    ...board.tiles.map((t) => ({ q: t.q, r: t.r })),
    ...board.oceans.filter((o) => o.lake).map((o) => ({ q: o.q, r: o.r })),
  ];
  for (const c of cells) {
    const { x, y } = axialToPixel(c, layout);
    for (let i = 0; i < 6; i++) {
      const [hx, hy] = hexCorner(x, y, s, i);
      if (i === 0) path.moveTo(hx, hy);
      else path.lineTo(hx, hy);
    }
    path.closePath();
  }
  return path;
}

export function drawLandGlow(
  ctx: CanvasRenderingContext2D,
  board: Board,
  layout: HexLayout,
  spread: number,
  feather: number,
  color: string
) {
  if (!board.tiles.length) return;
  const s = layout.size;
  const path = landSilhouettePath(board, layout);
  // Clip to "outside the land silhouette" so the blurred fill only shows on
  // the ocean side. Avoiding destination-out keeps the canvas fully opaque,
  // which is needed for cloud blend modes (overlay/soft-light) to work cleanly.
  ctx.save();
  const cutout = new Path2D();
  cutout.rect(-1e6, -1e6, 2e6, 2e6);
  cutout.addPath(path);
  ctx.clip(cutout, "evenodd");
  ctx.filter = `blur(${feather * s}px)`;
  ctx.fillStyle = color;
  ctx.fill(path);
  if (spread > 0) {
    ctx.strokeStyle = color;
    ctx.lineWidth = spread * s * 2;
    ctx.lineJoin = "round";
    ctx.stroke(path);
  }
  ctx.restore();
}

export function drawOceanFills(ctx: CanvasRenderingContext2D, board: Board, layout: HexLayout) {
  if (!board.oceans.length) return;
  const s = layout.size;
  for (const o of board.oceans) {
    const { x: cx, y: cy } = axialToPixel(o, layout);
    hexPath(ctx, cx, cy, s);
    ctx.fillStyle = o.lake ? "#234866" : "#1b3a5b";
    ctx.fill();
  }
}

export function drawBeaches(
  ctx: CanvasRenderingContext2D,
  board: Board,
  layout: HexLayout,
  foamColor: string,
  lakeFoamColor: string
) {
  if (!board.oceans.length) return;
  const land = new Set(board.tiles.map((t) => `${t.q},${t.r}`));
  const s = layout.size;
  for (const o of board.oceans) {
    const { x: cx, y: cy } = axialToPixel(o, layout);

    ctx.save();
    hexPath(ctx, cx, cy, s);
    ctx.clip();

    const landEdge: boolean[] = new Array(6).fill(false);
    for (let d = 0; d < 6; d++) {
      const dir = HEX_DIRS[d];
      if (land.has(`${o.q + dir.q},${o.r + dir.r}`)) landEdge[(6 - d) % 6] = true;
    }
    drawBeachRuns(ctx, cx, cy, s, landEdge, o.lake ? lakeFoamColor : foamColor);

    ctx.restore();
  }
}

export function drawFaceDownTile(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  // Hex card-back: warm earth tones — dark loam fill, deeper border, cream "?"
  ctx.save();
  hexPath(ctx, cx, cy, s);
  ctx.fillStyle = "#7a5a3e";
  ctx.fill();
  ctx.lineWidth = Math.max(1, s * 0.05);
  ctx.strokeStyle = "#5a3f2a";
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#6a4a30";
  ctx.font = `bold ${s * 1.1}px system-ui, sans-serif`;
  ctx.fillText("?", cx, cy + s * 0.05);
  ctx.restore();
}
