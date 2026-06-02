import { Board, TileType } from "../board";
import { axialToPixel, HexLayout } from "../hex";
import { BuildingImgs } from "../assets/loaders";
import { easeOutBack } from "../utils/easing";
import { hexPath } from "./primitives";
import {
  drawOceanFills,
  drawLandGlow,
  drawBeaches,
  drawFaceDownTile,
} from "./terrain";
import { drawPorts, PortOpts } from "./ports";
import { drawPlacements, BridgeTuning } from "./buildings";
import { drawPlacementHints, PlacementHintState } from "./placement-hints";
import { drawHoverIcon, HoverOpts } from "./hover-icon";
import { drawVignette, VignetteOpts } from "./vignette";
import { drawClouds, ensureCloudTextures, CloudOpts } from "./clouds";
import { drawDice } from "./dice";
import { drawResourceFog, FogOpts } from "./fog";
import { drawTileSheen } from "./tile-sheen";
import { BridgeVariant } from "../game/buildings";
import { PlacementGraph } from "../game/placement";
import {
  reveal,
  tileRevealProgress,
  numberRevealProgress,
} from "../animation/reveal";
import { tileNumberPopScale } from "../animation/dice";
import { View } from "../camera/layout";

export function draw(
  ctx: CanvasRenderingContext2D,
  board: Board,
  layout: HexLayout,
  images: Record<TileType, HTMLImageElement>,
  portIcons: Partial<Record<TileType, HTMLImageElement>>,
  buildingImgs: BuildingImgs,
  imgScale: number,
  view: View,
  dpr: number,
  numOpts: { scale: number; offX: number; offY: number },
  glowOpts: { spread: number; feather: number; innerSpread: number; innerFeather: number },
  beachOpts: { foamColor: string; lakeFoamColor: string },
  portOpts: PortOpts,
  buildingOpts: {
    settlementScale: number;
    settlementOffY: number;
    cityScale: number;
    cityOffY: number;
    bridgeTuning: Record<BridgeVariant, BridgeTuning>;
    pathWidth: number;
    pathBlend: GlobalCompositeOperation;
    getOwnerColor: (ownerId: number) => string;
    blend: GlobalCompositeOperation;
    shadowBlend: GlobalCompositeOperation;
    shadowAngleDeg: number;
    shadowSpread: number;
    shadowFeather: number;
    shadowOpacity: number;
    buildingScale: number;
    thievesScale: number;
    thievesOffY: number;
    thievesPos: { x: number; y: number } | null;
  },
  hoverOpts: HoverOpts,
  vignetteOpts: VignetteOpts,
  cloudOpts: CloudOpts,
  placementOpts: {
    graph: PlacementGraph;
    hints: PlacementHintState;
    buildingImgs: BuildingImgs;
    // Hint tint for the current builder (active player or opening pointer).
    hintColor: string;
    blend: GlobalCompositeOperation;
    bridgeTuning: Record<BridgeVariant, BridgeTuning>;
    buildingScale: number;
    settlementOffY: number;
  } | null,
  fogOpts: FogOpts,
  now: number
) {
  const { width, height } = ctx.canvas;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.translate(view.tx, view.ty);
  ctx.scale(view.zoom, view.zoom);

  // Paint the entire visible world area with the deep-bg color so there are
  // no transparent regions later (PNG corners, gaps between tiles). Cloud
  // blend modes need an opaque canvas to avoid hard edges.
  {
    const t2 = ctx.getTransform();
    const inv = t2.inverse();
    const tl = inv.transformPoint(new DOMPoint(0, 0));
    const br = inv.transformPoint(new DOMPoint(ctx.canvas.width, ctx.canvas.height));
    ctx.fillStyle = "#1b3a5b";
    ctx.fillRect(Math.min(tl.x, br.x), Math.min(tl.y, br.y), Math.abs(br.x - tl.x), Math.abs(br.y - tl.y));
  }

  drawOceanFills(ctx, board, layout);
  drawLandGlow(ctx, board, layout, glowOpts.spread, glowOpts.feather, "#234866");
  drawLandGlow(ctx, board, layout, glowOpts.innerSpread, glowOpts.innerFeather, "#5fa3d6");
  drawBeaches(ctx, board, layout, beachOpts.foamColor, beachOpts.lakeFoamColor);

  // assets are square PNGs with a pointy-top hex inscribed at full height;
  // draw as a square sized to the hex's corner-to-corner height
  const base = 2 * layout.size;
  const drawW = base * imgScale;
  const drawH = base * imgScale;

  // While any tile is still hidden/animating, paint the land hexes with a
  // tabletop-felt color underneath so the playable area reads as a board
  // surface rather than letting the ocean halo bleed through the shrinking cards.
  const anyHidden = board.tiles.some((_, i) => tileRevealProgress(i, now, board.tiles.length) < 1);
  if (anyHidden) {
    ctx.save();
    ctx.fillStyle = "#3d2a1a";
    for (const t of board.tiles) {
      const { x: tx, y: ty } = axialToPixel(t, layout);
      hexPath(ctx, tx, ty, layout.size);
      ctx.fill();
    }
    ctx.restore();
  }

  for (let i = 0; i < board.tiles.length; i++) {
    const tile = board.tiles[i];
    const { x, y } = axialToPixel(tile, layout);
    const p = tileRevealProgress(i, now, board.tiles.length);
    if (p < 0) {
      drawFaceDownTile(ctx, x, y, layout.size);
    } else if (p >= 1) {
      const img = images[tile.type];
      ctx.drawImage(img, x - drawW / 2, y - drawH / 2, drawW, drawH);
    } else {
      // First half: face-down shrinks uniformly from 1 to 0.
      // Second half: face-up pops back with overshoot.
      // A small per-tile rotation jitter (peaks mid-animation) gives it life.
      const rotation = (reveal.tileJitter[i] ?? 0) * Math.sin(p * Math.PI);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      if (p < 0.5) {
        const s = 1 - p * 2; // 1 → 0
        ctx.scale(s, s);
        ctx.translate(-x, -y);
        drawFaceDownTile(ctx, x, y, layout.size);
      } else {
        const half = (p - 0.5) * 2;
        const s = easeOutBack(half);
        ctx.scale(s, s);
        ctx.translate(-x, -y);
        const img = images[tile.type];
        ctx.drawImage(img, x - drawW / 2, y - drawH / 2, drawW, drawH);
      }
      ctx.restore();
    }
  }

  // Ports (piers + marker) — drawn after land so piers visually anchor to the land edge.
  drawPorts(ctx, board, layout, portIcons, portOpts);

  // number tokens
  const r = layout.size * numOpts.scale;
  const offX = layout.size * numOpts.offX;
  const offY = layout.size * numOpts.offY;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i < board.tiles.length; i++) {
    const tile = board.tiles[i];
    if (tile.number == null) continue;
    const np = numberRevealProgress(i, now, board.tiles.length);
    if (np < 0) continue;
    const { x, y } = axialToPixel(tile, layout);
    const cx = x + offX;
    const cy = y + offY;
    const baseScale = np >= 1 ? 1 : easeOutBack(np);
    const scale = baseScale * tileNumberPopScale(i, now);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = "#f4e4bc";
    ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.06);
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.stroke();

    const red = tile.number === 6 || tile.number === 8;
    ctx.fillStyle = red ? "#c0392b" : "#111";
    ctx.font = `bold ${r * 1.05}px system-ui, sans-serif`;
    ctx.fillText(String(tile.number), cx, cy + r * 0.04);

    // pip dots under the number (frequency indicator)
    const pips = 6 - Math.abs(7 - tile.number);
    const pipR = r * 0.08;
    const gap = pipR * 2.4;
    const totalW = (pips - 1) * gap;
    const py = cy + r * 0.55;
    for (let i2 = 0; i2 < pips; i2++) {
      ctx.beginPath();
      ctx.arc(cx - totalW / 2 + i2 * gap, py, pipR, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Fog over tiles + numbers, but under buildings so placements stay vibrant.
  drawResourceFog(ctx, board, layout, fogOpts, now);

  if (placementOpts) {
    drawPlacementHints(
      ctx,
      placementOpts.graph,
      placementOpts.hints,
      layout,
      placementOpts.buildingImgs,
      placementOpts.bridgeTuning,
      placementOpts.buildingScale,
      placementOpts.settlementOffY,
      now,
      "marks",
      placementOpts.hintColor,
    );
  }
  drawPlacements(ctx, buildingImgs, layout, { ...buildingOpts, now });
  drawTileSheen(ctx, board, layout, now);
  if (placementOpts) {
    drawPlacementHints(
      ctx,
      placementOpts.graph,
      placementOpts.hints,
      layout,
      placementOpts.buildingImgs,
      placementOpts.bridgeTuning,
      placementOpts.buildingScale,
      placementOpts.settlementOffY,
      now,
      "preview",
      placementOpts.hintColor,
    );
  }
  drawHoverIcon(ctx, board, layout, portIcons, hoverOpts);
  drawVignette(ctx, board, layout, vignetteOpts);

  // Clouds — drawn last, in world space (under the view transform) so panning
  // and zooming carry them along with the board.
  ensureCloudTextures(cloudOpts);
  drawClouds(ctx, cloudOpts);

  // Dice overlay (screen space, on top of everything).
  drawDice(ctx, dpr, now);
}
