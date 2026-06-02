import { HexLayout } from "../hex";
import { BuildingImgs } from "../assets/loaders";
import { buildings, bridges, vertexKey, BridgeVariant } from "../game/buildings";
import { placementBounceScale } from "../animation/placement-bounce";

export type BridgeTuning = { scale: number; offX: number; offY: number; rotDeg: number };

// Cache of tinted sprites (buildings + bridges), keyed by kind + color + blend.
const tintedBuildingCache = new Map<string, HTMLCanvasElement>();
export function tintedBuilding(kind: string, base: HTMLImageElement, mask: HTMLImageElement, color: string, blend: GlobalCompositeOperation): HTMLCanvasElement {
  const key = `${kind}|${color}|${blend}`;
  const cached = tintedBuildingCache.get(key);
  if (cached) return cached;

  const tm = document.createElement("canvas");
  tm.width = mask.naturalWidth; tm.height = mask.naturalHeight;
  const tctx = tm.getContext("2d")!;
  tctx.drawImage(mask, 0, 0);
  tctx.globalCompositeOperation = "source-in";
  tctx.fillStyle = color;
  tctx.fillRect(0, 0, tm.width, tm.height);

  const out = document.createElement("canvas");
  out.width = base.naturalWidth; out.height = base.naturalHeight;
  const octx = out.getContext("2d")!;
  octx.drawImage(base, 0, 0);
  octx.globalCompositeOperation = blend;
  octx.drawImage(tm, 0, 0);
  octx.globalCompositeOperation = "destination-in";
  octx.drawImage(base, 0, 0);

  // Keep cache small; reset when too many entries (different colours over time).
  if (tintedBuildingCache.size > 32) tintedBuildingCache.clear();
  tintedBuildingCache.set(key, out);
  return out;
}

// Cached blurred-black silhouette for shadow casting. Keyed by source sprite +
// rounded size + rounded blur so changing sprite/blur regenerates lazily.
const silhouetteCache = new Map<string, HTMLCanvasElement>();
export function silhouetteFor(
  sprite: HTMLCanvasElement | HTMLImageElement,
  size: number,
  blur: number,
): HTMLCanvasElement {
  const sizeKey = Math.round(size);
  const blurKey = Math.round(blur * 4) / 4;
  // @ts-expect-error — tag canvases with a stable id for cache keys.
  let sid = sprite.__silId as number | undefined;
  if (sid == null) {
    sid = silhouetteCache.size + 1;
    // @ts-expect-error — see above.
    sprite.__silId = sid;
  }
  const key = `${sid}|${sizeKey}|${blurKey}`;
  const cached = silhouetteCache.get(key);
  if (cached) return cached;

  const pad = Math.ceil(blurKey * 3) + 2;
  const w = sizeKey + pad * 2;
  const stamp = document.createElement("canvas");
  stamp.width = w;
  stamp.height = w;
  const sctx = stamp.getContext("2d")!;
  sctx.drawImage(sprite, pad, pad, sizeKey, sizeKey);
  sctx.globalCompositeOperation = "source-in";
  sctx.fillStyle = "#000";
  sctx.fillRect(0, 0, w, w);

  let out = stamp;
  if (blurKey > 0) {
    const blurred = document.createElement("canvas");
    blurred.width = w;
    blurred.height = w;
    const bctx = blurred.getContext("2d")!;
    bctx.filter = `blur(${blurKey}px)`;
    bctx.drawImage(stamp, 0, 0);
    out = blurred;
  }
  silhouetteCache.set(key, out);
  return out;
}

// Draw all settlements, cities, and bridges in a single pass, sorted by their
// vertical anchor so items lower on screen (closer to the viewer) overlap
// items higher up — natural "depth" ordering.
export function drawPlacements(
  ctx: CanvasRenderingContext2D,
  imgs: BuildingImgs,
  layout: HexLayout,
  opts: {
    settlementScale: number;
    settlementOffY: number;
    cityScale: number;
    cityOffY: number;
    // Per-owner color resolver. Used to tint each piece and stroke each
    // bridge path with the placing player's color.
    getOwnerColor: (ownerId: number) => string;
    blend: GlobalCompositeOperation;
    bridgeTuning: Record<BridgeVariant, BridgeTuning>;
    pathWidth: number;
    pathBlend: GlobalCompositeOperation;
    shadowBlend: GlobalCompositeOperation;
    shadowAngleDeg: number;
    shadowSpread: number;
    shadowFeather: number;
    shadowOpacity: number;
    buildingScale: number;
    thievesScale: number;
    thievesOffY: number;
    thievesPos: { x: number; y: number } | null;
    now: number;
  },
) {
  if (!buildings.size && !bridges.size && !opts.thievesPos) return;
  if (opts.buildingScale <= 0) return;
  const s = layout.size;

  // Player-colored road strokes laid down underneath the bridge sprites.
  // A bridge endpoint is "open" when it neither holds a friendly building
  // nor connects to another friendly bridge — in that case stroke only half
  // the edge so dangling bridges look like a clipped tip instead of a road
  // pointing into nothing.
  if (bridges.size && opts.pathWidth > 0) {
    ctx.save();
    ctx.globalCompositeOperation = opts.pathBlend;
    ctx.lineCap = "round";
    ctx.lineWidth = s * opts.pathWidth;
    // "Open" check is owner-scoped: a bridge endpoint counts as connected
    // only by the owner's own buildings / bridges, otherwise the dangling
    // tip clips to the midpoint.
    const incident = new Map<string, Map<number, number>>();
    const bump = (k: string, owner: number) => {
      let m = incident.get(k);
      if (!m) { m = new Map(); incident.set(k, m); }
      m.set(owner, (m.get(owner) ?? 0) + 1);
    };
    for (const rec of bridges.values()) {
      bump(vertexKey(rec.a[0], rec.a[1]), rec.ownerId);
      bump(vertexKey(rec.b[0], rec.b[1]), rec.ownerId);
    }
    for (const rec of bridges.values()) {
      const ka = vertexKey(rec.a[0], rec.a[1]);
      const kb = vertexKey(rec.b[0], rec.b[1]);
      const aBld = buildings.get(ka);
      const bBld = buildings.get(kb);
      const aOpen = !(aBld && aBld.ownerId === rec.ownerId) && (incident.get(ka)?.get(rec.ownerId) ?? 0) <= 1;
      const bOpen = !(bBld && bBld.ownerId === rec.ownerId) && (incident.get(kb)?.get(rec.ownerId) ?? 0) <= 1;
      const mx = (rec.a[0] + rec.b[0]) / 2;
      const my = (rec.a[1] + rec.b[1]) / 2;
      const sx = aOpen ? mx : rec.a[0];
      const sy = aOpen ? my : rec.a[1];
      const ex = bOpen ? mx : rec.b[0];
      const ey = bOpen ? my : rec.b[1];
      ctx.strokeStyle = opts.getOwnerColor(rec.ownerId);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Placement descriptor so the same items can be rendered to (1) a unified
  // outline buffer and (2) the main canvas in sort order.
  type Placement = {
    sortY: number;
    sprite: HTMLCanvasElement | HTMLImageElement;
    cx: number; cy: number; size: number; rotation: number;
  };
  const items: Placement[] = [];

  if (buildings.size) {
    for (const [v, rec] of buildings) {
      const [xPart, yPart] = v.split("|").map(Number);
      const wx = xPart / 4, wy = yPart / 4;
      const color = opts.getOwnerColor(rec.ownerId);
      const sprite = rec.kind === "city"
        ? tintedBuilding("city", imgs.city, imgs.cityMask, color, opts.blend)
        : tintedBuilding("settlement", imgs.settlement, imgs.settlementMask, color, opts.blend);
      const bounce = placementBounceScale(v, opts.now);
      const size = s * (rec.kind === "city" ? opts.cityScale : opts.settlementScale) * opts.buildingScale * bounce;
      if (size <= 0) continue;
      const offY = (rec.kind === "city" ? opts.cityOffY : opts.settlementOffY) * s;
      items.push({
        sortY: wy + offY + size * 0.5,
        sprite,
        cx: wx,
        cy: wy + offY,
        size,
        rotation: 0,
      });
    }
  }

  if (bridges.size) {
    for (const [k, rec] of bridges) {
      const color = opts.getOwnerColor(rec.ownerId);
      const sprite: HTMLCanvasElement | null = rec.variant === "30up"
        ? tintedBuilding("bridge30up", imgs.bridge30up, imgs.bridge30upMask, color, opts.blend)
        : rec.variant === "30down"
        ? tintedBuilding("bridge30down", imgs.bridge30down, imgs.bridge30downMask, color, opts.blend)
        : imgs.bridgeStraight && imgs.bridgeStraightMask
        ? tintedBuilding("bridgeStraight", imgs.bridgeStraight, imgs.bridgeStraightMask, color, opts.blend)
        : null;
      if (!sprite) continue;
      const parts = k.slice(2).split("|").map(Number);
      const wx = parts[0] / 4, wy = parts[1] / 4;
      const tune = opts.bridgeTuning[rec.variant];
      const bounce = placementBounceScale(k, opts.now);
      const size = s * tune.scale * opts.buildingScale * bounce;
      if (size <= 0) continue;
      const drawX = wx + tune.offX * s;
      const drawY = wy + tune.offY * s;
      const rad = (tune.rotDeg * Math.PI) / 180;
      items.push({
        sortY: drawY + size * 0.25,
        sprite,
        cx: drawX,
        cy: drawY,
        size,
        rotation: rad,
      });
    }
  }

  if (opts.thievesPos && opts.thievesScale > 0) {
    const size = s * opts.thievesScale * opts.buildingScale;
    if (size > 0) {
      const cy = opts.thievesPos.y + opts.thievesOffY * s;
      items.push({
        sortY: cy + size * 0.5,
        sprite: imgs.thieves,
        cx: opts.thievesPos.x,
        cy,
        size,
        rotation: 0,
      });
    }
  }

  items.sort((a, b) => a.sortY - b.sortY);

  // Shadow pass — render a cached blurred silhouette of each sprite at an
  // angle/spread offset. Decoupled from the sprite render so the shadow's
  // blend mode and opacity don't recolor the building itself.
  const shadowAlpha = Math.max(0, Math.min(1, opts.shadowOpacity));
  if (shadowAlpha > 0) {
    const rad = (opts.shadowAngleDeg * Math.PI) / 180;
    const dx = Math.cos(rad);
    const dy = Math.sin(rad);
    ctx.save();
    ctx.globalCompositeOperation = opts.shadowBlend;
    ctx.globalAlpha = shadowAlpha;
    for (const it of items) {
      const s = it.size;
      const blurPx = Math.max(0, s * opts.shadowFeather);
      const sil = silhouetteFor(it.sprite, s, blurPx);
      const pad = (sil.width - s) / 2;
      const offX = s * opts.shadowSpread * dx;
      const offY = s * opts.shadowSpread * dy;
      ctx.save();
      ctx.translate(it.cx, it.cy);
      if (it.rotation) ctx.rotate(it.rotation);
      ctx.drawImage(sil, -s / 2 - pad + offX, -s / 2 - pad + offY);
      ctx.restore();
    }
    ctx.restore();
  }

  for (const it of items) {
    ctx.save();
    ctx.translate(it.cx, it.cy);
    if (it.rotation) ctx.rotate(it.rotation);
    ctx.drawImage(it.sprite, -it.size / 2, -it.size / 2, it.size, it.size);
    ctx.restore();
  }
}
