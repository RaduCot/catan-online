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
    visibleBuildingKeys?: Set<string>;
    visibleBridgeKeys?: Set<string>;
    thievesTileIdx: number;
    robberMoveActive: boolean;
    robberMoveValidTiles?: Set<number>;
    robberMoveHoverPos?: { x: number; y: number } | null;
    robberMoveHoverIdx?: number;
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

  // Robber "locked tile" grayscale — desaturate the tile BEFORE numbers so
  // the chance number on top stays in colour. Desert is excluded (it never
  // produces anyway, so locking it visually would be noise). Suppressed
  // mid-flip and during robber-move (the piece is about to relocate).
  const robberIdx = buildingOpts.thievesTileIdx;
  const showRobberLock = robberIdx >= 0
    && !buildingOpts.robberMoveActive
    && !!board.tiles[robberIdx]
    && board.tiles[robberIdx].type !== "desert"
    && tileRevealProgress(robberIdx, now, board.tiles.length) >= 1;
  if (showRobberLock) {
    const tile = board.tiles[robberIdx];
    const { x, y } = axialToPixel(tile, layout);
    ctx.save();
    hexPath(ctx, x, y, layout.size);
    ctx.clip();
    ctx.globalCompositeOperation = "saturation";
    ctx.fillStyle = "hsl(0, 0%, 50%)";
    ctx.fillRect(x - layout.size, y - layout.size, layout.size * 2, layout.size * 2);
    ctx.restore();
  }

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

  // Lock icon on the robber's number token — drawn over the (still-colored)
  // number so the "this tile is out of action" cue is unambiguous. The
  // grayscale tint already went down before the number pass.
  if (showRobberLock) {
    const tile = board.tiles[robberIdx];
    if (tile.number != null) {
      const { x, y } = axialToPixel(tile, layout);
      const r = layout.size * numOpts.scale;
      const offX = layout.size * numOpts.offX;
      const offY = layout.size * numOpts.offY;
      const cx = x + offX + r * 0.85;
      const cy = y + offY - r * 0.85;
      const sz = r * 1.05;
      ctx.save();
      // Soft halo so the icon reads on both light and dark tiles.
      ctx.shadowColor = "rgba(0,0,0,0.85)";
      ctx.shadowBlur = sz * 0.4;
      ctx.shadowOffsetY = sz * 0.05;
      ctx.drawImage(buildingImgs.lock, cx - sz / 2, cy - sz / 2, sz, sz);
      // Second pass: warm gold glow on top of the dark halo.
      ctx.shadowColor = "rgba(244,199,87,0.7)";
      ctx.shadowBlur = sz * 0.55;
      ctx.shadowOffsetY = 0;
      ctx.drawImage(buildingImgs.lock, cx - sz / 2, cy - sz / 2, sz, sz);
      ctx.restore();
    }
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
  // Robber-move hints: gold ring on every valid target, red ring on current
  // robber tile so the player sees both "where it is now" and "where it can go".
  if (buildingOpts.robberMoveActive) {
    const pulse = 0.5 + 0.5 * Math.sin((now / 1000) * (Math.PI * 2 / 1.6));
    const valid = buildingOpts.robberMoveValidTiles;
    if (valid && valid.size) {
      ctx.save();
      const hoverIdx = buildingOpts.robberMoveHoverIdx ?? -1;
      for (const idx of valid) {
        const tile = board.tiles[idx];
        if (!tile) continue;
        const { x, y } = axialToPixel(tile, layout);
        // Hovered target lightens + thickens like the bridge placement hint;
        // the rest pulse gold.
        const hovered = idx === hoverIdx;
        ctx.lineWidth = layout.size * (hovered ? 0.09 : 0.06);
        ctx.strokeStyle = hovered
          ? "rgba(255, 240, 200, 0.95)"
          : `rgba(255, 220, 120, ${0.55 + 0.35 * pulse})`;
        ctx.beginPath();
        ctx.arc(x, y, layout.size * 0.62, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
    if (buildingOpts.thievesTileIdx >= 0 && board.tiles[buildingOpts.thievesTileIdx]) {
      const tile = board.tiles[buildingOpts.thievesTileIdx];
      const { x, y } = axialToPixel(tile, layout);
      ctx.save();
      ctx.lineWidth = layout.size * 0.08;
      ctx.strokeStyle = `rgba(217, 106, 74, ${0.7 + 0.25 * pulse})`;
      ctx.beginPath();
      ctx.arc(x, y, layout.size * 0.62, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    // Ghost thief under the cursor — same artwork/size/offset as the placed
    // piece but at 0.55 alpha, matching the settlement/bridge placement ghost.
    if (buildingOpts.robberMoveHoverPos && buildingOpts.thievesScale > 0 && buildingImgs.thieves) {
      const size = layout.size * buildingOpts.thievesScale * buildingOpts.buildingScale;
      if (size > 0) {
        const cx = buildingOpts.robberMoveHoverPos.x;
        const cy = buildingOpts.robberMoveHoverPos.y + buildingOpts.thievesOffY * layout.size;
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.drawImage(buildingImgs.thieves, cx - size / 2, cy - size / 2, size, size);
        ctx.restore();
      }
    }
  }
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
}
