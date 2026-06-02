import { Board, generateBoard, MapStyle, PortType, TILE_TYPES, TileType } from "./board";
import { axialToPixel, hexBounds, HexLayout } from "./hex";

import clayUrl from "../assets/clay.png";
import desertUrl from "../assets/desert.png";
import forestUrl from "../assets/forest.png";
import mountainUrl from "../assets/mountain.png";
import sheepUrl from "../assets/sheep.png";
import wheatUrl from "../assets/wheat.png";

import iconBrickUrl from "../assets/resources/brick.png";
import iconWoodUrl from "../assets/resources/wood.png";
import iconStoneUrl from "../assets/resources/stone.png";
import iconSheepUrl from "../assets/resources/sheep.png";
import iconWheatUrl from "../assets/resources/wheat.png";
import settlementUrl from "../assets/buildings/settlement.png";
import settlementCmaskUrl from "../assets/buildings/settlement_cmask.png";
import cityUrl from "../assets/buildings/city.png";
import cityCmaskUrl from "../assets/buildings/city_cmask.png";
import bridge30upUrl from "../assets/buildings/bridge30up.png";
import bridge30upCmaskUrl from "../assets/buildings/bridge30up_cmask.png";
import bridge30downUrl from "../assets/buildings/bridge30down.png";
import bridge30downCmaskUrl from "../assets/buildings/bridge30down_cmask.png";
import bridgeVerticalUrl from "../assets/buildings/bridgevertical.png";
import bridgeVerticalCmaskUrl from "../assets/buildings/bridgevertical_cmask.png";
import thievesUrl from "../assets/thieves.png";

const TILE_URLS: Record<TileType, string> = {
  bricks: clayUrl,
  desert: desertUrl,
  forest: forestUrl,
  mountain: mountainUrl,
  sheep: sheepUrl,
  wheat: wheatUrl,
};

// Port resource → icon image url (subset of TileType, no desert).
const PORT_ICON_URLS: Partial<Record<TileType, string>> = {
  bricks: iconBrickUrl,
  forest: iconWoodUrl,
  mountain: iconStoneUrl,
  sheep: iconSheepUrl,
  wheat: iconWheatUrl,
};

async function loadImages(): Promise<Record<TileType, HTMLImageElement>> {
  const entries = await Promise.all(
    TILE_TYPES.map(
      (t) =>
        new Promise<[TileType, HTMLImageElement]>((res, rej) => {
          const img = new Image();
          img.onload = () => res([t, img]);
          img.onerror = rej;
          img.src = TILE_URLS[t];
        })
    )
  );
  return Object.fromEntries(entries) as Record<TileType, HTMLImageElement>;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = url;
  });
}

async function loadPortIcons(): Promise<Partial<Record<TileType, HTMLImageElement>>> {
  const entries = await Promise.all(
    Object.entries(PORT_ICON_URLS).map(
      ([t, url]) =>
        new Promise<[TileType, HTMLImageElement]>((res, rej) => {
          const img = new Image();
          img.onload = () => res([t as TileType, img]);
          img.onerror = rej;
          img.src = url!;
        })
    )
  );
  return Object.fromEntries(entries);
}

function fitLayout(board: Board, canvasW: number, canvasH: number, padding = 40): HexLayout {
  const all = [...board.tiles, ...board.oceans];
  const probe: HexLayout = { size: 1, originX: 0, originY: 0 };
  const b = hexBounds(all, probe);
  const scale = Math.min(
    (canvasW - padding * 2) / b.width,
    (canvasH - padding * 2) / b.height
  );
  const size = scale;
  const real: HexLayout = { size, originX: 0, originY: 0 };
  const rb = hexBounds(all, real);
  const originX = (canvasW - rb.width) / 2 - rb.minX;
  const originY = (canvasH - rb.height) / 2 - rb.minY;
  return { size, originX, originY };
}

type View = { tx: number; ty: number; zoom: number };

// Mouse-hover icon overlay state. Tracks the currently-hovered land tile and a
// smoothly tweened display alpha so the icon fades in on entry and out on exit.
type HoverState = {
  idx: number;        // tile whose icon is currently being displayed (-1 = none)
  pending: number;    // tile we want to switch to once the current one finishes fading out
  alpha: number;      // current display alpha (0–1)
  target: number;     // alpha we're tweening toward (0 or 1)
};
const hover: HoverState = { idx: -1, pending: -1, alpha: 0, target: 0 };
type HoverOpts = {
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

// Reveal animation state. Cards start hidden; when the user clicks "reveal
// board" the tiles flip up one by one (staggered) and once they're all visible
// the numbers appear in the same fashion. Toggling back hides everything
// instantly. `tileOrder` and `numberOrder` are randomised permutations of the
// tile indices so the reveal isn't always in the same direction.
const TILE_REVEAL_STAGGER = 0.06;
const TILE_FLIP_DURATION = 0.55;
const NUMBER_REVEAL_STAGGER = 0.05;
const NUMBER_POP_DURATION = 0.5;
const NUMBERS_AFTER_TILES_DELAY = 0.25;

// Bouncy ease — overshoots 1 then settles back. Used for the tail of card
// flips and the number-token pop-in.
function easeOutBack(x: number): number {
  const c1 = 1.85;
  const c3 = c1 + 1;
  return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
}
type RevealState = {
  hidden: boolean;
  animStart: number;
  tileOrder: number[];
  numberOrder: number[];
  tileJitter: number[];   // small random rotation per tile (radians)
  numberJitter: number[]; // ditto for number tokens
};
const reveal: RevealState = {
  hidden: true,
  animStart: 0,
  tileOrder: [],
  numberOrder: [],
  tileJitter: [],
  numberJitter: [],
};

function rebuildRevealOrders(board: Board) {
  reveal.tileOrder = board.tiles.map((_, i) => i);
  reveal.numberOrder = board.tiles.map((_, i) => i);
  for (let i = reveal.tileOrder.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [reveal.tileOrder[i], reveal.tileOrder[j]] = [reveal.tileOrder[j], reveal.tileOrder[i]];
    [reveal.numberOrder[i], reveal.numberOrder[j]] = [reveal.numberOrder[j], reveal.numberOrder[i]];
  }
  reveal.tileJitter = board.tiles.map(() => (Math.random() - 0.5) * 0.18);   // ±~5°
  reveal.numberJitter = board.tiles.map(() => (Math.random() - 0.5) * 0.35); // ±~10°
}

// Three reveal modes drive how tiles flip up:
//  - default: classic Catan opening — face-down until the S→B→S→B sequence
//    completes, then all tiles flip up at once with a staggered animation.
//  - all-visible: board face-up from the start (still using a one-shot flip
//    animation per tile when the game (re)starts).
//  - fog: only tiles adjacent to a friendly building OR bridge endpoint flip
//    up. Placing a bridge "scouts" — its far endpoint pulls neighboring tiles
//    into view.
type RevealMode = "default" | "all-visible" | "fog";
let revealMode: RevealMode = "default";
// Per-tile flip start times (perf.now ms). Populated in fog / all-visible
// modes; ignored in default mode (which uses reveal.tileOrder staggering).
const tileRevealAt = new Map<number, number>();

function revealProgress(now: number, totalTiles: number) {
  const elapsed = (now - reveal.animStart) / 1000;
  const allTilesDoneAt = (totalTiles - 1) * TILE_REVEAL_STAGGER + TILE_FLIP_DURATION;
  const numbersStartAt = (totalTiles - 1) * TILE_REVEAL_STAGGER + NUMBERS_AFTER_TILES_DELAY;
  return { elapsed, allTilesDoneAt, numbersStartAt };
}

// Returns t (-Inf, 0, ..., 1, >1): <0 not started, 0-1 mid-flip, >1 finished.
function tileRevealProgress(i: number, now: number, totalTiles: number): number {
  if (revealMode !== "default") {
    const start = tileRevealAt.get(i);
    if (start == null) return -Infinity;
    return ((now - start) / 1000) / TILE_FLIP_DURATION;
  }
  if (reveal.hidden) return -Infinity;
  const rank = reveal.tileOrder.indexOf(i);
  const { elapsed } = revealProgress(now, totalTiles);
  return (elapsed - rank * TILE_REVEAL_STAGGER) / TILE_FLIP_DURATION;
}

function numberRevealProgress(i: number, now: number, totalTiles: number): number {
  if (revealMode !== "default") {
    const start = tileRevealAt.get(i);
    if (start == null) return -Infinity;
    const elapsedSec = (now - start) / 1000;
    const numStart = TILE_FLIP_DURATION + 0.05;
    return (elapsedSec - numStart) / NUMBER_POP_DURATION;
  }
  if (reveal.hidden) return -Infinity;
  const rank = reveal.numberOrder.indexOf(i);
  const { elapsed, numbersStartAt } = revealProgress(now, totalTiles);
  return (elapsed - numbersStartAt - rank * NUMBER_REVEAL_STAGGER) / NUMBER_POP_DURATION;
}

// Dice roll overlay. Screen-space panel with two tumbling dice and the total.
const DICE_ROLL_DURATION = 0.9;
const DICE_SETTLE_DURATION = 0.5;
const DICE_FADE_DURATION = 1.0; // seconds — panel fades out after settling, then dismisses
const DOT_PATTERNS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [[0.28, 0.28], [0.72, 0.72]],
  3: [[0.28, 0.28], [0.5, 0.5], [0.72, 0.72]],
  4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
  5: [[0.28, 0.28], [0.72, 0.28], [0.5, 0.5], [0.28, 0.72], [0.72, 0.72]],
  6: [[0.28, 0.22], [0.72, 0.22], [0.28, 0.5], [0.72, 0.5], [0.28, 0.78], [0.72, 0.78]],
};
type DiceState = {
  visible: boolean;
  startT: number;
  dice: [number, number];
  spin: [number, number];
  matchOrder: number[]; // tile indices whose number == sum, randomised
};
const dice: DiceState = { visible: false, startT: 0, dice: [1, 1], spin: [0, 0], matchOrder: [] };

const HIT_POP_DURATION = 0.7;
const HIT_POP_STAGGER = 0.08;

function rollDice(board: Board) {
  dice.visible = true;
  dice.startT = performance.now();
  dice.dice = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
  dice.spin = [
    (Math.random() < 0.5 ? -1 : 1) * (8 + Math.random() * 6),
    (Math.random() < 0.5 ? -1 : 1) * (8 + Math.random() * 6),
  ];
  const sum = dice.dice[0] + dice.dice[1];
  const matches = board.tiles
    .map((t, i) => (t.number === sum ? i : -1))
    .filter((i) => i >= 0);
  for (let i = matches.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [matches[i], matches[j]] = [matches[j], matches[i]];
  }
  dice.matchOrder = matches;
}

function tileNumberPopScale(i: number, now: number): number {
  if (!dice.matchOrder.length) return 1;
  const rank = dice.matchOrder.indexOf(i);
  if (rank < 0) return 1;
  const popStartSec = dice.startT / 1000 + DICE_ROLL_DURATION + DICE_SETTLE_DURATION;
  const t = now / 1000 - popStartSec - rank * HIT_POP_STAGGER;
  if (t <= 0 || t >= HIT_POP_DURATION) return 1;
  // 1 → ~1.6 (peak around 0.5) → 1, with a small bounce on the way down
  const phase = t / HIT_POP_DURATION;
  const peak = 0.6 * Math.sin(phase * Math.PI);
  const wobble = 0.08 * Math.sin(phase * Math.PI * 3) * (1 - phase);
  return 1 + peak + wobble;
}

// Tile sheen — a brief white pulse painted over a producing tile when its
// resources fly out. Keyed by tile index → start time (ms).
const TILE_SHEEN_DURATION = 700;
const tileSheen = new Map<number, number>();
function tileSheenAnimationRunning() {
  return tileSheen.size > 0;
}

// Per-piece placement bounce. Keyed by vertex/edge key → spawn time (ms). The
// piece pops in from scale 0 with easeOutBack so building feels satisfying.
const PLACEMENT_BOUNCE_DURATION = 450;
const placementBounce = new Map<string, number>();
function placementBounceScale(key: string, now: number): number {
  const start = placementBounce.get(key);
  if (start == null) return 1;
  const t = (now - start) / PLACEMENT_BOUNCE_DURATION;
  if (t >= 1) { placementBounce.delete(key); return 1; }
  if (t <= 0) return 0;
  return Math.max(0, easeOutBack(t));
}
function placementBounceAnimationRunning() {
  return placementBounce.size > 0;
}

function matchPopAnimationRunning(now: number) {
  if (!dice.matchOrder.length) return false;
  const popStartSec = dice.startT / 1000 + DICE_ROLL_DURATION + DICE_SETTLE_DURATION;
  const popEndSec = popStartSec + dice.matchOrder.length * HIT_POP_STAGGER + HIT_POP_DURATION;
  return now / 1000 < popEndSec + 0.05;
}

function diceAnimationRunning(now: number) {
  if (!dice.visible) return false;
  const elapsed = (now - dice.startT) / 1000;
  if (elapsed > DICE_ROLL_DURATION + DICE_SETTLE_DURATION + DICE_FADE_DURATION) {
    dice.visible = false;
    return true; // one more frame so the panel clears
  }
  return true;
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawDie(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, face: number, rotation: number, scale: number, highlight: boolean) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  ctx.scale(scale, scale);
  // Body
  const r = size * 0.18;
  roundedRect(ctx, -size / 2, -size / 2, size, size, r);
  // Drop shadow
  ctx.shadowColor = highlight ? "rgba(255,210,120,0.85)" : "rgba(0,0,0,0.6)";
  ctx.shadowBlur = highlight ? 24 : 14;
  ctx.shadowOffsetY = highlight ? 0 : 6;
  const grad = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
  grad.addColorStop(0, "#fcf7e8");
  grad.addColorStop(1, "#d9c8a3");
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.lineWidth = size * 0.05;
  ctx.strokeStyle = "#7a5a3e";
  ctx.stroke();
  // Dots
  ctx.fillStyle = "#3d2a1a";
  const dotR = size * 0.08;
  for (const [fx, fy] of DOT_PATTERNS[face]) {
    ctx.beginPath();
    ctx.arc(-size / 2 + fx * size, -size / 2 + fy * size, dotR, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawDice(ctx: CanvasRenderingContext2D, dpr: number, now: number) {
  if (!dice.visible) return;
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cssW = ctx.canvas.width / dpr;
  const cssH = ctx.canvas.height / dpr;

  const elapsed = (now - dice.startT) / 1000;
  const rolling = elapsed < DICE_ROLL_DURATION;
  const settleT = rolling ? 0 : Math.min(1, (elapsed - DICE_ROLL_DURATION) / DICE_SETTLE_DURATION);
  const fadeStart = DICE_ROLL_DURATION + DICE_SETTLE_DURATION;
  const fadeAlpha = elapsed < fadeStart ? 1 : Math.max(0, 1 - (elapsed - fadeStart) / DICE_FADE_DURATION);
  if (fadeAlpha <= 0) { ctx.restore(); return; }
  ctx.globalAlpha = fadeAlpha;

  // Large dice centered on the canvas, total below.
  const size = 160;
  const gap = 50;
  const cx = cssW / 2;
  const cy = cssH / 2 - 40;
  const leftX = cx - size / 2 - gap / 2;
  const rightX = cx + size / 2 + gap / 2;

  let d1 = dice.dice[0], d2 = dice.dice[1];
  let rot1 = 0, rot2 = 0, scale1 = 1, scale2 = 1;
  if (rolling) {
    const t = elapsed;
    d1 = 1 + Math.floor((t * 30) % 6);
    d2 = 1 + Math.floor((t * 30 + 3) % 6);
    rot1 = t * dice.spin[0];
    rot2 = t * dice.spin[1];
    scale1 = 1 + Math.sin(t * 18) * 0.08;
    scale2 = 1 + Math.cos(t * 18) * 0.08;
  } else {
    const e = easeOutBack(settleT);
    scale1 = scale2 = e;
  }
  drawDie(ctx, leftX, cy, size, d1, rot1, scale1, !rolling);
  drawDie(ctx, rightX, cy, size, d2, rot2, scale2, !rolling);

  // Total
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (!rolling) {
    const popScale = easeOutBack(settleT);
    ctx.translate(cx, cy + size / 2 + 80);
    ctx.scale(popScale, popScale);
    ctx.shadowColor = "rgba(0,0,0,0.65)";
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = "#ffd66b";
    ctx.font = "bold 90px system-ui, sans-serif";
    ctx.fillText(String(dice.dice[0] + dice.dice[1]), 0, 0);
  }
  ctx.restore();

  ctx.restore();
  void cssH; // referenced for completeness; cssH used implicitly via cy
}

function revealAnimationRunning(now: number, totalTiles: number) {
  if (revealMode !== "default") {
    for (const start of tileRevealAt.values()) {
      const elapsedSec = (now - start) / 1000;
      const totalEnd = TILE_FLIP_DURATION + 0.05 + NUMBER_POP_DURATION + 0.05;
      if (elapsedSec < totalEnd) return true;
    }
    return false;
  }
  if (reveal.hidden || totalTiles === 0) return false;
  const { elapsed, numbersStartAt } = revealProgress(now, totalTiles);
  const totalEnd = numbersStartAt + (totalTiles - 1) * NUMBER_REVEAL_STAGGER + NUMBER_POP_DURATION;
  return elapsed < totalEnd + 0.1;
}

// Tileable multi-octave value-noise cloud texture (white pixels with alpha).
// Two textures are built and cross-faded each frame to give a morphing feel.
function buildCloudTexture(N: number, seed: number, density: number, color: [number, number, number]): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = N; c.height = N;
  const cctx = c.getContext("2d")!;
  const id = cctx.createImageData(N, N);
  const sizes = [8, 16, 32];
  const weights = [0.55, 0.3, 0.15];
  const grids = sizes.map((sz, i) => {
    let s = (seed * 2654435761 + i * 0x9e3779b1) >>> 0;
    const g = new Float32Array(sz * sz);
    for (let k = 0; k < g.length; k++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      g[k] = ((s >>> 8) & 0xffffff) / 0xffffff;
    }
    return g;
  });
  const sampleGrid = (grid: Float32Array, sz: number, x: number, y: number) => {
    const fx = (x / N) * sz;
    const fy = (y / N) * sz;
    const x0 = ((Math.floor(fx) % sz) + sz) % sz;
    const y0 = ((Math.floor(fy) % sz) + sz) % sz;
    const x1 = (x0 + 1) % sz;
    const y1 = (y0 + 1) % sz;
    const sx = fx - Math.floor(fx);
    const sy = fy - Math.floor(fy);
    const u = sx * sx * (3 - 2 * sx);
    const v = sy * sy * (3 - 2 * sy);
    const a = grid[y0 * sz + x0], b = grid[y0 * sz + x1];
    const cc = grid[y1 * sz + x0], d = grid[y1 * sz + x1];
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + cc * (1 - u) * v + d * u * v;
  };
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let n = 0;
      for (let i = 0; i < sizes.length; i++) n += weights[i] * sampleGrid(grids[i], sizes[i], x, y);
      const alpha = n > density ? Math.min(1, (n - density) / (1 - density)) : 0;
      const idx = (y * N + x) * 4;
      id.data[idx] = color[0];
      id.data[idx + 1] = color[1];
      id.data[idx + 2] = color[2];
      id.data[idx + 3] = Math.round(alpha * 255);
    }
  }
  cctx.putImageData(id, 0, 0);
  return c;
}

type CloudState = {
  texA: HTMLCanvasElement | null;
  texB: HTMLCanvasElement | null;
  cacheKey: string;
  windAngle: number;
  windOffsetX: number;
  windOffsetY: number;
  windOffsetX2: number;
  windOffsetY2: number;
  morphPhase: number;
  lastT: number;
};

const cloudState: CloudState = {
  texA: null, texB: null, cacheKey: "",
  windAngle: 0, windOffsetX: 0, windOffsetY: 0, windOffsetX2: 0, windOffsetY2: 0,
  morphPhase: 0, lastT: 0,
};

type VignetteOpts = {
  enabled: boolean;
  color: string;
  intensity: number;
  feather: number;
  scale: number;
};

// Circular vignette anchored to the play area. Radius matches the playable
// bbox + a slack for pan freedom; feather controls how soft the falloff is,
// intensity controls the maximum opacity at the outer edge.
function drawVignette(
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

type CloudOpts = {
  enabled: boolean;
  color: string;
  opacity: number;
  density: number;
  scale: number;
  windSpeed: number;
  windDrift: number;
  morphSpeed: number;
  blend: GlobalCompositeOperation;
};

function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const c = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(255 * c).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function parseHexRgb(hex: string): [number, number, number] {
  const m = hex.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return [0, 0, 0];
  return [
    parseInt(m[1].slice(0, 2), 16),
    parseInt(m[1].slice(2, 4), 16),
    parseInt(m[1].slice(4, 6), 16),
  ];
}

function ensureCloudTextures(opts: CloudOpts) {
  const rgb = parseHexRgb(opts.color);
  const key = `${opts.density.toFixed(3)}|${rgb.join(",")}`;
  if (key === cloudState.cacheKey && cloudState.texA && cloudState.texB) return;
  cloudState.texA = buildCloudTexture(256, 1, opts.density, rgb);
  cloudState.texB = buildCloudTexture(256, 99173, opts.density, rgb);
  cloudState.cacheKey = key;
}

function updateCloudWind(opts: CloudOpts, now: number) {
  const dt = cloudState.lastT === 0 ? 0 : Math.min(0.1, (now - cloudState.lastT) / 1000);
  cloudState.lastT = now;
  // Wind angle drifts slowly; speed is along that angle. Second layer drifts
  // ~30° off for a subtle morphing/eddying feel.
  cloudState.windAngle += opts.windDrift * dt;
  cloudState.windOffsetX += Math.cos(cloudState.windAngle) * opts.windSpeed * dt;
  cloudState.windOffsetY += Math.sin(cloudState.windAngle) * opts.windSpeed * dt;
  cloudState.windOffsetX2 += Math.cos(cloudState.windAngle + 0.5) * opts.windSpeed * 0.6 * dt;
  cloudState.windOffsetY2 += Math.sin(cloudState.windAngle + 0.5) * opts.windSpeed * 0.6 * dt;
  cloudState.morphPhase += opts.morphSpeed * dt;
}

function drawClouds(ctx: CanvasRenderingContext2D, opts: CloudOpts) {
  if (!opts.enabled || !cloudState.texA || !cloudState.texB) return;
  // The current ctx transform = view (pan/zoom) applied. We want clouds anchored
  // to the world, so we keep that transform and fill the visible world rect.
  const t = ctx.getTransform();
  const inv = t.inverse();
  const tl = inv.transformPoint(new DOMPoint(0, 0));
  const br = inv.transformPoint(new DOMPoint(ctx.canvas.width, ctx.canvas.height));
  const rectX = Math.min(tl.x, br.x);
  const rectY = Math.min(tl.y, br.y);
  const rectW = Math.abs(br.x - tl.x);
  const rectH = Math.abs(br.y - tl.y);

  const m = 0.5 + 0.5 * Math.sin(cloudState.morphPhase);
  const draw = (tex: HTMLCanvasElement, alpha: number, ox: number, oy: number) => {
    if (alpha <= 0) return;
    const pattern = ctx.createPattern(tex, "repeat");
    if (!pattern) return;
    pattern.setTransform(new DOMMatrix().translate(ox, oy).scale(opts.scale / 256));
    ctx.save();
    ctx.globalCompositeOperation = opts.blend;
    ctx.globalAlpha = opts.opacity * alpha;
    ctx.fillStyle = pattern;
    ctx.fillRect(rectX, rectY, rectW, rectH);
    ctx.restore();
  };
  draw(cloudState.texA, 1 - m, cloudState.windOffsetX, cloudState.windOffsetY);
  draw(cloudState.texB, m, cloudState.windOffsetX2, cloudState.windOffsetY2);
}

// pointy-top hex corner i (0..5), starting upper-right and going clockwise.
function hexCorner(cx: number, cy: number, size: number, i: number): [number, number] {
  const ang = ((i * 60 - 30) * Math.PI) / 180;
  return [cx + size * Math.cos(ang), cy + size * Math.sin(ang)];
}

function hexPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const [x, y] = hexCorner(cx, cy, size, i);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}


const HEX_DIRS = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
  { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
];

// Stroke each contiguous run of land-bordering edges as a single polyline so
// that two adjacent land edges share a clean mitered corner instead of two
// overlapping perpendicular strokes.
function drawBeachRuns(
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


function landSilhouettePath(board: Board, layout: HexLayout): Path2D {
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

function drawLandGlow(
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

function drawOceanFills(ctx: CanvasRenderingContext2D, board: Board, layout: HexLayout) {
  if (!board.oceans.length) return;
  const s = layout.size;
  for (const o of board.oceans) {
    const { x: cx, y: cy } = axialToPixel(o, layout);
    hexPath(ctx, cx, cy, s);
    ctx.fillStyle = o.lake ? "#234866" : "#1b3a5b";
    ctx.fill();
  }
}

function drawBeaches(
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

// Buildings (settlement → city → empty) pinned at hex-tile corners. Stored as
// quantised world coords so the same corner shared by two land tiles collapses
// into a single vertex.
type BuildingKind = "settlement" | "city";
const buildings = new Map<string, BuildingKind>();
const vertexKey = (x: number, y: number) => `${Math.round(x * 4)}|${Math.round(y * 4)}`;

// Bridges live on hex edges, keyed by edge-midpoint world coords. The variant
// records the edge orientation so we know which sprite to use. Mirrored edges
// (e.g. edges 1 and 4) share a variant since the line is the same orientation.
type BridgeVariant = "30up" | "30down" | "straight";
// Bridge stores the variant + the two endpoint coords so we can stroke a player-
// colored road along the hex edge underneath the sprite.
type BridgeRecord = { variant: BridgeVariant; a: [number, number]; b: [number, number] };
const bridges = new Map<string, BridgeRecord>();
const edgeKey = (x: number, y: number) => `e:${Math.round(x * 4)}|${Math.round(y * 4)}`;

function edgeVariant(edgeIdx: number): BridgeVariant {
  // pointy-top edges: 0,3 are vertical → "straight" (assets pending);
  // 1,4 share the "\" diagonal → "30down"; 2,5 share the "/" diagonal → "30up".
  if (edgeIdx === 0 || edgeIdx === 3) return "straight";
  if (edgeIdx === 1 || edgeIdx === 4) return "30up";
  return "30down";
}


// --- Placement rules. Catan: settlements/cities at vertices (distance-2
// apart), bridges (roads) at edges, must be connected to a friendly building
// or bridge. Opening phase is a forced sequence: S1, B1 touching S1, S2
// anywhere valid, B2 touching S2. After that → free mode.
type PlacementStep = "initial-s1" | "initial-b1" | "initial-s2" | "initial-b2" | "free";
let placementStep: PlacementStep = "initial-s1";
// Vertex key of the most recently placed initial settlement — the next bridge
// must touch it.
let lastInitialSettlementKey: string | null = null;

type PlacementEdge = {
  mid: [number, number];
  variant: BridgeVariant;
  a: [number, number];
  b: [number, number];
  ak: string; // endpoint vertex keys
  bk: string;
};
type PlacementGraph = {
  vertices: Map<string, [number, number]>;
  edges: Map<string, PlacementEdge>;
  vertexEdges: Map<string, Set<string>>;     // vertex key → incident edge keys
  vertexNeighbors: Map<string, Set<string>>; // vertex key → vertex keys 1 edge away
};

function buildPlacementGraph(board: Board, layout: HexLayout): PlacementGraph {
  const vertices = new Map<string, [number, number]>();
  const edges = new Map<string, PlacementEdge>();
  const vertexEdges = new Map<string, Set<string>>();
  const vertexNeighbors = new Map<string, Set<string>>();
  const s = layout.size;
  const ensure = <K, V>(m: Map<K, Set<V>>, k: K) => {
    let cur = m.get(k);
    if (!cur) { cur = new Set(); m.set(k, cur); }
    return cur;
  };
  for (const t of board.tiles) {
    const { x, y } = axialToPixel(t, layout);
    const corners: [number, number][] = [];
    const keys: string[] = [];
    for (let i = 0; i < 6; i++) {
      const c = hexCorner(x, y, s, i);
      corners.push(c);
      const k = vertexKey(c[0], c[1]);
      keys.push(k);
      vertices.set(k, c);
    }
    for (let i = 0; i < 6; i++) {
      const ak = keys[i];
      const bk = keys[(i + 1) % 6];
      const [ax, ay] = corners[i];
      const [bx, by] = corners[(i + 1) % 6];
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      const ek = edgeKey(mx, my);
      if (!edges.has(ek)) {
        edges.set(ek, { mid: [mx, my], variant: edgeVariant(i), a: [ax, ay], b: [bx, by], ak, bk });
      }
      ensure(vertexEdges, ak).add(ek);
      ensure(vertexEdges, bk).add(ek);
      ensure(vertexNeighbors, ak).add(bk);
      ensure(vertexNeighbors, bk).add(ak);
    }
  }
  return { vertices, edges, vertexEdges, vertexNeighbors };
}

// Distance rule: a vertex is OK for settlement iff it itself is empty AND no
// vertex one edge away holds a settlement/city.
function settlementDistanceOk(vk: string, graph: PlacementGraph): boolean {
  if (buildings.has(vk)) return false;
  for (const n of graph.vertexNeighbors.get(vk) ?? []) {
    if (buildings.has(n)) return false;
  }
  return true;
}

function vertexConnectedByBridge(vk: string, graph: PlacementGraph): boolean {
  for (const e of graph.vertexEdges.get(vk) ?? []) {
    if (bridges.has(e)) return true;
  }
  return false;
}

function validSettlementVertices(graph: PlacementGraph): Set<string> {
  const out = new Set<string>();
  if (placementStep === "initial-s1" || placementStep === "initial-s2") {
    for (const vk of graph.vertices.keys()) {
      if (settlementDistanceOk(vk, graph)) out.add(vk);
    }
  } else if (placementStep === "free") {
    if (!canAfford("settlement")) return out;
    for (const vk of graph.vertices.keys()) {
      if (!settlementDistanceOk(vk, graph)) continue;
      if (!vertexConnectedByBridge(vk, graph)) continue;
      out.add(vk);
    }
  }
  return out;
}

function validBridgeEdges(graph: PlacementGraph): Set<string> {
  const out = new Set<string>();
  if (placementStep === "initial-b1" || placementStep === "initial-b2") {
    if (!lastInitialSettlementKey) return out;
    for (const e of graph.vertexEdges.get(lastInitialSettlementKey) ?? []) {
      if (!bridges.has(e)) out.add(e);
    }
  } else if (placementStep === "free") {
    if (!canAfford("bridge")) return out;
    for (const [ek, eData] of graph.edges) {
      if (bridges.has(ek)) continue;
      let connected = false;
      for (const vk of [eData.ak, eData.bk]) {
        if (buildings.has(vk)) { connected = true; break; }
        for (const other of graph.vertexEdges.get(vk) ?? []) {
          if (other !== ek && bridges.has(other)) { connected = true; break; }
        }
        if (connected) break;
      }
      if (connected) out.add(ek);
    }
  }
  return out;
}

// Snap mouse world position to nearest valid placement target. Vertex/edge,
// whichever is closer within the snap radius.
function snapPlacementHover(
  graph: PlacementGraph,
  vSet: Set<string>,
  cSet: Set<string>,
  eSet: Set<string>,
  wx: number,
  wy: number,
  size: number,
): { kind: "vertex" | "edge"; key: string } | null {
  if (wx < -1e8 || wy < -1e8) return null;
  let bestKind: "vertex" | "edge" | null = null;
  let bestKey = "";
  let bestD = Infinity;
  const vMax = size * 0.45;
  const eMax = size * 0.3;
  for (const vk of vSet) {
    const v = graph.vertices.get(vk);
    if (!v) continue;
    const d = Math.hypot(v[0] - wx, v[1] - wy);
    if (d < bestD && d < vMax) { bestD = d; bestKind = "vertex"; bestKey = vk; }
  }
  for (const vk of cSet) {
    const v = graph.vertices.get(vk);
    if (!v) continue;
    const d = Math.hypot(v[0] - wx, v[1] - wy);
    if (d < bestD && d < vMax) { bestD = d; bestKind = "vertex"; bestKey = vk; }
  }
  for (const ek of eSet) {
    const e = graph.edges.get(ek);
    if (!e) continue;
    const d = Math.hypot(e.mid[0] - wx, e.mid[1] - wy);
    if (d < bestD && d < eMax) { bestD = d; bestKind = "edge"; bestKey = ek; }
  }
  return bestKind ? { kind: bestKind, key: bestKey } : null;
}

function validCityVertices(): Set<string> {
  const out = new Set<string>();
  if (placementStep !== "free") return out;
  if (!canAfford("city")) return out;
  for (const [vk, kind] of buildings) {
    if (kind === "settlement") out.add(vk);
  }
  return out;
}

// Building reveal scale: when the board flips from face-down to face-up,
// buildings shrink to 0 during the flip then pop back to 1 with easeOutBack
// after the numbers finish appearing.
const BUILD_REVEAL_SHRINK_DUR = 0.3;
const BUILD_REVEAL_GROW_DUR = 0.5;
const BUILD_REVEAL_GROW_DELAY = 0.15;

function buildingScaleAt(now: number, totalTiles: number): number {
  // Only the default mode does the global reveal flip that buildings need
  // to duck under — fog / all-visible flip per tile, buildings stay full-size.
  if (revealMode !== "default") return 1;
  if (reveal.hidden || totalTiles === 0) return 1;
  const elapsed = (now - reveal.animStart) / 1000;
  if (elapsed < 0) return 1;
  const { numbersStartAt } = revealProgress(now, totalTiles);
  const numbersEnd = numbersStartAt + (totalTiles - 1) * NUMBER_REVEAL_STAGGER + NUMBER_POP_DURATION;
  const growStart = numbersEnd + BUILD_REVEAL_GROW_DELAY;
  if (elapsed < BUILD_REVEAL_SHRINK_DUR) {
    const p = elapsed / BUILD_REVEAL_SHRINK_DUR;
    return Math.max(0, 1 - p * p);
  }
  if (elapsed < growStart) return 0;
  const gp = (elapsed - growStart) / BUILD_REVEAL_GROW_DUR;
  if (gp >= 1) return 1;
  return Math.max(0, easeOutBack(gp));
}

function buildingScaleAnimationRunning(now: number, totalTiles: number) {
  if (reveal.hidden || totalTiles === 0) return false;
  const elapsed = (now - reveal.animStart) / 1000;
  const { numbersStartAt } = revealProgress(now, totalTiles);
  const numbersEnd = numbersStartAt + (totalTiles - 1) * NUMBER_REVEAL_STAGGER + NUMBER_POP_DURATION;
  const growStart = numbersEnd + BUILD_REVEAL_GROW_DELAY;
  return elapsed >= 0 && elapsed < growStart + BUILD_REVEAL_GROW_DUR + 0.05;
}

// Cache of tinted sprites (buildings + bridges), keyed by kind + color + blend.
const tintedBuildingCache = new Map<string, HTMLCanvasElement>();
function tintedBuilding(kind: string, base: HTMLImageElement, mask: HTMLImageElement, color: string, blend: GlobalCompositeOperation): HTMLCanvasElement {
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

type BuildingImgs = {
  settlement: HTMLImageElement;
  settlementMask: HTMLImageElement;
  city: HTMLImageElement;
  cityMask: HTMLImageElement;
  bridge30up: HTMLImageElement;
  bridge30upMask: HTMLImageElement;
  bridge30down: HTMLImageElement;
  bridge30downMask: HTMLImageElement;
  // Straight (vertical-edge) bridge artwork pending — null means skip render.
  bridgeStraight: HTMLImageElement | null;
  bridgeStraightMask: HTMLImageElement | null;
  // Thieves / robber — neutral piece (no per-player tint). Sits on the
  // desert by default and is moved when a 7 is rolled.
  thieves: HTMLImageElement;
};

type BridgeTuning = { scale: number; offX: number; offY: number; rotDeg: number };

// Cached blurred-black silhouette for shadow casting. Keyed by source sprite +
// rounded size + rounded blur so changing sprite/blur regenerates lazily.
const silhouetteCache = new Map<string, HTMLCanvasElement>();
function silhouetteFor(
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
function drawPlacements(
  ctx: CanvasRenderingContext2D,
  imgs: BuildingImgs,
  layout: HexLayout,
  opts: {
    settlementScale: number;
    settlementOffY: number;
    cityScale: number;
    cityOffY: number;
    color: string;
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
    ctx.strokeStyle = opts.color;
    ctx.lineCap = "round";
    ctx.lineWidth = s * opts.pathWidth;
    const incident = new Map<string, number>();
    for (const rec of bridges.values()) {
      const ka = vertexKey(rec.a[0], rec.a[1]);
      const kb = vertexKey(rec.b[0], rec.b[1]);
      incident.set(ka, (incident.get(ka) ?? 0) + 1);
      incident.set(kb, (incident.get(kb) ?? 0) + 1);
    }
    for (const rec of bridges.values()) {
      const ka = vertexKey(rec.a[0], rec.a[1]);
      const kb = vertexKey(rec.b[0], rec.b[1]);
      const aOpen = !buildings.has(ka) && (incident.get(ka) ?? 0) <= 1;
      const bOpen = !buildings.has(kb) && (incident.get(kb) ?? 0) <= 1;
      const mx = (rec.a[0] + rec.b[0]) / 2;
      const my = (rec.a[1] + rec.b[1]) / 2;
      const sx = aOpen ? mx : rec.a[0];
      const sy = aOpen ? my : rec.a[1];
      const ex = bOpen ? mx : rec.b[0];
      const ey = bOpen ? my : rec.b[1];
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
    const settlementSprite = tintedBuilding("settlement", imgs.settlement, imgs.settlementMask, opts.color, opts.blend);
    const citySprite = tintedBuilding("city", imgs.city, imgs.cityMask, opts.color, opts.blend);
    for (const [v, kind] of buildings) {
      const [xPart, yPart] = v.split("|").map(Number);
      const wx = xPart / 4, wy = yPart / 4;
      const sprite = kind === "city" ? citySprite : settlementSprite;
      const bounce = placementBounceScale(v, opts.now);
      const size = s * (kind === "city" ? opts.cityScale : opts.settlementScale) * opts.buildingScale * bounce;
      if (size <= 0) continue;
      const offY = (kind === "city" ? opts.cityOffY : opts.settlementOffY) * s;
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
    const bridgeSprites: Record<BridgeVariant, HTMLCanvasElement | null> = {
      "30up": tintedBuilding("bridge30up", imgs.bridge30up, imgs.bridge30upMask, opts.color, opts.blend),
      "30down": tintedBuilding("bridge30down", imgs.bridge30down, imgs.bridge30downMask, opts.color, opts.blend),
      straight: imgs.bridgeStraight && imgs.bridgeStraightMask
        ? tintedBuilding("bridgeStraight", imgs.bridgeStraight, imgs.bridgeStraightMask, opts.color, opts.blend)
        : null,
    };
    for (const [k, rec] of bridges) {
      const sprite = bridgeSprites[rec.variant];
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

// Snapshot of valid placement targets + hovered snap. Recomputed each render
// from the current placement step and existing buildings/bridges.
type PlacementHintState = {
  step: PlacementStep;
  vertices: Set<string>;
  cities: Set<string>;
  edges: Set<string>;
  hover: { kind: "vertex" | "edge"; key: string } | null;
};

function drawPlacementHints(
  ctx: CanvasRenderingContext2D,
  graph: PlacementGraph,
  hints: PlacementHintState,
  layout: HexLayout,
  imgs: BuildingImgs,
  bridgeTuning: Record<BridgeVariant, BridgeTuning>,
  buildingScale: number,
  settlementOffYK: number,
  now: number,
  phase: "marks" | "preview",
) {
  if (hints.step === "free" && hints.vertices.size === 0 && hints.edges.size === 0 && hints.cities.size === 0) return;
  if (buildingScale <= 0) return;
  const s = layout.size;
  // Slow pulse — sine cycling once per ~1.6s for both vertices and edges.
  const pulse = 0.5 + 0.5 * Math.sin((now / 1000) * (Math.PI * 2 / 1.6));

  if (phase === "preview") {
    // Hover preview only — sits on top of the buildings so the ghost is
    // never occluded by a neighbouring piece.
    if (hints.hover) {
      ctx.save();
      ctx.globalAlpha = 0.55;
      if (hints.hover.kind === "vertex") {
        const v = graph.vertices.get(hints.hover.key);
        if (v) {
          const isUpgrade = hints.cities.has(hints.hover.key);
          // Ghosts use the untinted source artwork so the preview reads as a
          // neutral "what would land here" rather than a claimed piece.
          const sprite = isUpgrade ? imgs.city : imgs.settlement;
          const size = s * (isUpgrade ? 0.85 : 0.7) * buildingScale;
          const offY = settlementOffYK * s;
          ctx.drawImage(sprite, v[0] - size / 2, v[1] - size / 2 + offY, size, size);
        }
      } else {
        const e = graph.edges.get(hints.hover.key);
        if (e) {
          const variant = e.variant;
          const sprite: HTMLImageElement | null = variant === "30up"
            ? imgs.bridge30up
            : variant === "30down"
            ? imgs.bridge30down
            : imgs.bridgeStraight;
          if (sprite) {
            const tune = bridgeTuning[variant];
            const size = s * tune.scale * buildingScale;
            const drawX = e.mid[0] + tune.offX * s;
            const drawY = e.mid[1] + tune.offY * s;
            const rad = (tune.rotDeg * Math.PI) / 180;
            ctx.save();
            ctx.translate(drawX, drawY);
            if (rad) ctx.rotate(rad);
            ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
            ctx.restore();
          }
        }
      }
      ctx.restore();
    }
    return;
  }

  // Valid settlement vertices — pulsing gold rings.
  for (const vk of hints.vertices) {
    const v = graph.vertices.get(vk);
    if (!v) continue;
    const hovered = hints.hover?.kind === "vertex" && hints.hover.key === vk;
    const r = s * (hovered ? 0.18 : 0.11 + 0.018 * pulse);
    ctx.save();
    ctx.translate(v[0], v[1]);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    grad.addColorStop(0, hovered ? "rgba(255, 230, 140, 0.95)" : `rgba(255, 220, 120, ${0.55 + 0.25 * pulse})`);
    grad.addColorStop(0.6, hovered ? "rgba(255, 200, 90, 0.6)" : "rgba(255, 200, 90, 0.35)");
    grad.addColorStop(1, "rgba(255, 200, 90, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = hovered ? "rgba(255, 250, 220, 0.95)" : "rgba(255, 240, 200, 0.85)";
    ctx.lineWidth = s * (hovered ? 0.03 : 0.018);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Existing settlements that can be upgraded — cyan halo.
  for (const vk of hints.cities) {
    const v = graph.vertices.get(vk);
    if (!v) continue;
    const hovered = hints.hover?.kind === "vertex" && hints.hover.key === vk;
    const r = s * (hovered ? 0.32 : 0.24 + 0.02 * pulse);
    ctx.save();
    ctx.translate(v[0], v[1]);
    const grad = ctx.createRadialGradient(0, 0, r * 0.4, 0, 0, r);
    grad.addColorStop(0, "rgba(160, 220, 255, 0)");
    grad.addColorStop(0.7, hovered ? "rgba(160, 220, 255, 0.55)" : `rgba(160, 220, 255, ${0.25 + 0.15 * pulse})`);
    grad.addColorStop(1, "rgba(160, 220, 255, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Valid bridge edges — solid stroke whose opacity pulses gently.
  for (const ek of hints.edges) {
    const e = graph.edges.get(ek);
    if (!e) continue;
    const hovered = hints.hover?.kind === "edge" && hints.hover.key === ek;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineWidth = s * (hovered ? 0.11 : 0.07);
    const alpha = hovered ? 0.95 : 0.35 + 0.4 * pulse;
    ctx.strokeStyle = hovered
      ? "rgba(255, 240, 200, 0.95)"
      : `rgba(255, 220, 120, ${alpha})`;
    ctx.beginPath();
    ctx.moveTo(e.a[0], e.a[1]);
    ctx.lineTo(e.b[0], e.b[1]);
    ctx.stroke();
    ctx.restore();
  }

}

function drawHoverIcon(
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
function findHoveredNumberTokenTileIdx(
  board: Board,
  layout: HexLayout,
  view: View,
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

function drawFaceDownTile(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
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

type PortOpts = {
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

function drawPorts(ctx: CanvasRenderingContext2D, board: Board, layout: HexLayout, portIcons: Partial<Record<TileType, HTMLImageElement>>, opts: PortOpts) {
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

// Tile index where the thieves currently sit. -1 = not placed (e.g. board has
// no desert, or before the first restart). Updated when the board (re)starts
// to default to the first desert tile.
let thievesTileIdx: number = -1;

function defaultThievesIdx(board: Board): number {
  for (let i = 0; i < board.tiles.length; i++) {
    if (board.tiles[i].type === "desert") return i;
  }
  return -1;
}

// Vertex is "explored" if any friendly building sits on it OR any friendly
// bridge has it as an endpoint. In fog mode, tiles become visible the moment
// any of their 6 corners is explored.
function exploredVertexKeys(): Set<string> {
  const set = new Set<string>();
  for (const vk of buildings.keys()) set.add(vk);
  for (const rec of bridges.values()) {
    set.add(vertexKey(rec.a[0], rec.a[1]));
    set.add(vertexKey(rec.b[0], rec.b[1]));
  }
  return set;
}

function exploredTileIndices(board: Board, layout: HexLayout): Set<number> {
  const out = new Set<number>();
  const explored = exploredVertexKeys();
  const s = layout.size;
  for (let i = 0; i < board.tiles.length; i++) {
    const { x, y } = axialToPixel(board.tiles[i], layout);
    for (let c = 0; c < 6; c++) {
      const [cx, cy] = hexCorner(x, y, s, c);
      if (explored.has(vertexKey(cx, cy))) { out.add(i); break; }
    }
  }
  return out;
}

// Add reveal entries for any newly-explored tile in fog mode. Idempotent.
// The opening (S→B→S→B) stays fully face-down even in fog mode — the per-tile
// scouting only kicks in once the player is in free-play.
function refreshFogReveals(board: Board, layout: HexLayout) {
  if (revealMode !== "fog" || placementStep !== "free") return;
  const t = performance.now();
  const explored = exploredTileIndices(board, layout);
  for (const i of explored) {
    if (!tileRevealAt.has(i)) tileRevealAt.set(i, t);
  }
}

// Reset reveal bookkeeping for the requested mode. Call on mode change and on
// game restart.
function applyRevealModeReset(board: Board, layout: HexLayout) {
  tileRevealAt.clear();
  if (revealMode === "default") {
    reveal.hidden = true;
    return;
  }
  reveal.hidden = false;
  const t = performance.now();
  if (revealMode === "all-visible") {
    for (let i = 0; i < board.tiles.length; i++) tileRevealAt.set(i, t);
  } else if (revealMode === "fog" && placementStep === "free") {
    // Mid-game flip: seed entries for everything currently explored. During
    // the opening we leave the map face-down on purpose.
    for (const i of exploredTileIndices(board, layout)) tileRevealAt.set(i, t);
  }
}

type FogOpts = { enabled: boolean; color: string; opacity: number };

// Dim tiles that won't yield resources to the player — any non-desert tile
// with no friendly building on any of its 6 corners. Honored in both face-up
// and face-down states so the player can plan settlement positions even
// before the board is revealed.
function drawResourceFog(
  ctx: CanvasRenderingContext2D,
  board: Board,
  layout: HexLayout,
  opts: FogOpts,
  now: number,
) {
  if (!opts.enabled || opts.opacity <= 0) return;
  const s = layout.size;
  const total = board.tiles.length;
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
        if (buildings.has(vertexKey(cx, cy))) { yielding = true; break; }
      }
      if (yielding) continue;
    }
    hexPath(ctx, x, y, s);
    ctx.fill();
  }
  ctx.restore();
}

function draw(
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
    color: string;
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
    color: string;
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

// Resources kept as a flat record keyed by canonical resource name. The
// multiplayer layer should call setResources(...) with authoritative counts
// whenever the player's hand changes.
type ResourceKind = "wood" | "brick" | "sheep" | "wheat" | "stone";
const RESOURCE_ORDER: ResourceKind[] = ["wood", "brick", "sheep", "wheat", "stone"];
const RESOURCE_ICONS: Record<ResourceKind, string> = {
  wood: iconWoodUrl,
  brick: iconBrickUrl,
  sheep: iconSheepUrl,
  wheat: iconWheatUrl,
  stone: iconStoneUrl,
};
const RESOURCE_LABELS: Record<ResourceKind, string> = {
  wood: "Wood",
  brick: "Brick",
  sheep: "Sheep",
  wheat: "Wheat",
  stone: "Stone",
};
const resourceCounts: Record<ResourceKind, number> = {
  wood: 0, brick: 0, sheep: 0, wheat: 0, stone: 0,
};

// Module-scope callbacks set by main() so cross-cutting concerns (trade panel
// rate badges, passives badges) can react to resource / placement changes
// without threading wiring through every mutation site.
let onResourcesChanged: () => void = () => {};
let refreshPassivesAndTrade: () => void = () => {};

function mountResourceHud() {
  const root = document.getElementById("resource-hud");
  if (!root) return;
  root.innerHTML = "";
  for (const kind of RESOURCE_ORDER) {
    const cell = document.createElement("div");
    cell.className = "res";
    cell.dataset.res = kind;
    cell.dataset.count = "0";
    cell.title = RESOURCE_LABELS[kind];
    const img = document.createElement("img");
    img.src = RESOURCE_ICONS[kind];
    img.alt = RESOURCE_LABELS[kind];
    img.draggable = false;
    const count = document.createElement("span");
    count.className = "count";
    count.textContent = "0";
    cell.appendChild(img);
    cell.appendChild(count);
    root.appendChild(cell);
  }
  const total = document.createElement("div");
  total.className = "total";
  total.innerHTML = '<span class="num" id="resource-total">0</span><span>cards</span>';
  root.appendChild(total);
}

function renderResourceHud() {
  const root = document.getElementById("resource-hud");
  if (!root) return;
  let total = 0;
  for (const kind of RESOURCE_ORDER) {
    const cell = root.querySelector<HTMLElement>(`.res[data-res="${kind}"]`);
    if (!cell) continue;
    const n = resourceCounts[kind];
    cell.dataset.count = String(n);
    const span = cell.querySelector(".count");
    if (span) span.textContent = String(n);
    total += n;
  }
  const totalEl = document.getElementById("resource-total");
  if (totalEl) totalEl.textContent = String(total);
  onResourcesChanged();
}

function setResources(next: Partial<Record<ResourceKind, number>>) {
  for (const k of RESOURCE_ORDER) {
    if (next[k] != null) resourceCounts[k] = Math.max(0, Math.floor(next[k]!));
  }
  renderResourceHud();
}

// Expose for multiplayer/dev wiring. Replace with real game-state subscription
// once the netcode is in.
(window as unknown as { catan?: { setResources: typeof setResources; getResources: () => Record<ResourceKind, number> } }).catan = {
  setResources,
  getResources: () => ({ ...resourceCounts }),
};

// Tile type → producible resource. Desert (no resource) is omitted.
const TILE_TO_RESOURCE: Partial<Record<TileType, ResourceKind>> = {
  forest: "wood",
  bricks: "brick",
  sheep: "sheep",
  wheat: "wheat",
  mountain: "stone",
};

// Standard Catan building costs.
const BUILD_COSTS: Record<"settlement" | "city" | "bridge", Partial<Record<ResourceKind, number>>> = {
  settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 },
  bridge:     { wood: 1, brick: 1 },
  city:       { wheat: 2, stone: 3 },
};

function canAfford(kind: "settlement" | "city" | "bridge"): boolean {
  const cost = BUILD_COSTS[kind];
  for (const r of RESOURCE_ORDER) {
    if ((cost[r] ?? 0) > resourceCounts[r]) return false;
  }
  return true;
}

function spendForBuild(kind: "settlement" | "city" | "bridge") {
  const cost = BUILD_COSTS[kind];
  for (const r of RESOURCE_ORDER) {
    const c = cost[r] ?? 0;
    if (c) resourceCounts[r] = Math.max(0, resourceCounts[r] - c);
  }
  renderResourceHud();
}

// Map ResourceKind → matching 2:1 port type name (board.ts uses TileType
// naming for specific ports).
const RESOURCE_TO_PORT_TYPE: Record<ResourceKind, PortType> = {
  wood: "forest",
  brick: "bricks",
  sheep: "sheep",
  wheat: "wheat",
  stone: "mountain",
};

// Bank trade rule set. Vanilla Catan only allows N-of-the-same-resource
// trades. The "mixed" variant — any N cards regardless of type — is a
// house-rule preset that will be selectable from the lobby; keep the helpers
// around so we can flip this with one line.
type BankTradeRule = "standard" | "mixed";
let BANK_TRADE_RULE: BankTradeRule = "standard";

// Custom rule: each opening settlement must sit on a vertex with exactly one
// neighbouring 6 or 8 tile. Only meaningful in fog-of-war mode (in default /
// all-visible the player already sees every chance number).
let ruleGuaranteed68: boolean = false;

function countNeighbor68(vk: string, board: Board, layout: HexLayout): number {
  const s = layout.size;
  let count = 0;
  for (let i = 0; i < board.tiles.length; i++) {
    const n = board.tiles[i].number;
    if (n !== 6 && n !== 8) continue;
    const { x, y } = axialToPixel(board.tiles[i], layout);
    for (let c = 0; c < 6; c++) {
      const [cx, cy] = hexCorner(x, y, s, c);
      if (vertexKey(cx, cy) === vk) { count++; break; }
    }
  }
  return count;
}

function filterByNeighbor68(
  vertices: Set<string>,
  board: Board,
  layout: HexLayout,
  required: 0 | 1,
): Set<string> {
  const out = new Set<string>();
  for (const vk of vertices) {
    if (countNeighbor68(vk, board, layout) === required) out.add(vk);
  }
  return out;
}

// Total 6/8 neighbours already claimed by existing settlements/cities. We
// allow at most ONE across the whole opening, so S2 must have zero left.
function existingBuildings68Count(board: Board, layout: HexLayout): number {
  let total = 0;
  for (const vk of buildings.keys()) {
    total += countNeighbor68(vk, board, layout);
  }
  return total;
}

function applyGuaranteed68IfActive(
  validV: Set<string>,
  board: Board,
  layout: HexLayout,
): Set<string> {
  if (!ruleGuaranteed68) return validV;
  if (revealMode !== "fog") return validV;
  if (placementStep !== "initial-s1" && placementStep !== "initial-s2") return validV;
  // S1: exactly one 6/8 neighbour. S2: zero, but only if S1 actually claimed
  // a 6/8 (the fallback case where the board had no candidate for S1 means
  // S2 still aims for one to satisfy the rule's guarantee).
  const alreadyClaimed = existingBuildings68Count(board, layout);
  const required: 0 | 1 = alreadyClaimed >= 1 ? 0 : 1;
  const filtered = filterByNeighbor68(validV, board, layout, required);
  // Fall back to the unfiltered set if the board has no candidates — the
  // rule shouldn't lock the player out entirely on a hostile layout.
  return filtered.size > 0 ? filtered : validV;
}

function tradeRateFor(resource: ResourceKind, ports: Set<PortType>): 2 | 3 | 4 {
  if (ports.has(RESOURCE_TO_PORT_TYPE[resource])) return 2;
  if (ports.has("3:1")) return 3;
  return 4;
}

// A port is "owned" (its trade ratio active) when the player has a settlement
// or city on either of its two dock corners — the corners of the ocean tile's
// edge that touches the adjacent land tile.
function ownedPortTypes(board: Board, layout: HexLayout): Set<PortType> {
  const out = new Set<PortType>();
  const s = layout.size;
  for (const ocean of board.oceans) {
    if (!ocean.port) continue;
    const { x, y } = axialToPixel(ocean, layout);
    // Edge i is between corners i and i+1; neighbor across edge i sits at the
    // HEX_DIRS angle (6 - i) mod 6 because the corner convention runs
    // clockwise while HEX_DIRS is keyed counter-clockwise from due-east.
    const ei = (6 - ocean.port.facing) % 6;
    const [ax, ay] = hexCorner(x, y, s, ei);
    const [bx, by] = hexCorner(x, y, s, (ei + 1) % 6);
    if (buildings.has(vertexKey(ax, ay)) || buildings.has(vertexKey(bx, by))) {
      out.add(ocean.port.type);
    }
  }
  return out;
}


function drawTileSheen(
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

function bumpResourceCell(resource: ResourceKind) {
  const root = document.getElementById("resource-hud");
  if (!root) return;
  const cell = root.querySelector<HTMLElement>(`.res[data-res="${resource}"]`);
  if (!cell) return;
  cell.classList.remove("bump");
  // Force reflow so the same class re-triggers the keyframe animation.
  void cell.offsetWidth;
  cell.classList.add("bump");
}

function spawnResourceFly(
  resource: ResourceKind,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  delayMs: number,
) {
  const root = document.getElementById("resource-fx");
  if (!root) return;
  const img = document.createElement("img");
  img.src = RESOURCE_ICONS[resource];
  img.alt = "";
  img.draggable = false;
  img.className = "fx-icon";
  img.style.left = `${fromX}px`;
  img.style.top = `${fromY}px`;
  root.appendChild(img);

  const dx = toX - fromX;
  const dy = toY - fromY;
  // Arc apex above the straight-line midpoint for a playful toss.
  const apexLift = Math.min(140, Math.max(60, Math.hypot(dx, dy) * 0.18));

  const anim = img.animate(
    [
      { transform: "translate(-50%, -50%) scale(0)", opacity: 0, offset: 0 },
      {
        transform: "translate(-50%, -50%) scale(1.35)",
        opacity: 1,
        offset: 0.18,
        easing: "cubic-bezier(.34, 1.56, .64, 1)",
      },
      {
        transform: `translate(calc(-50% + ${dx * 0.5}px), calc(-50% + ${dy * 0.5 - apexLift}px)) scale(1.15)`,
        opacity: 1,
        offset: 0.6,
        easing: "cubic-bezier(.45, 0, .55, 1)",
      },
      {
        transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.55)`,
        opacity: 0.85,
        offset: 1,
      },
    ],
    { duration: 850, delay: delayMs, fill: "forwards" },
  );
  anim.onfinish = () => {
    img.remove();
    resourceCounts[resource] = (resourceCounts[resource] ?? 0) + 1;
    renderResourceHud();
    bumpResourceCell(resource);
  };
}

function tileScreenCenter(idx: number, board: Board, layout: HexLayout, view: View, canvas: HTMLCanvasElement) {
  const { x, y } = axialToPixel(board.tiles[idx], layout);
  const rect = canvas.getBoundingClientRect();
  return {
    x: rect.left + x * view.zoom + view.tx,
    y: rect.top + y * view.zoom + view.ty,
  };
}

function resourceCellCenter(resource: ResourceKind) {
  const cell = document.querySelector<HTMLElement>(`#resource-hud .res[data-res="${resource}"]`);
  if (!cell) return { x: window.innerWidth / 2, y: window.innerHeight - 40 };
  const r = cell.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

const YIELD_STAGGER_MS = 100;
const YIELD_BASE_DELAY_MS = (DICE_ROLL_DURATION + DICE_SETTLE_DURATION) * 1000 + 200;

function scheduleRollYields(board: Board, layout: HexLayout, view: View, canvas: HTMLCanvasElement) {
  if (!dice.matchOrder.length || !buildings.size) return;
  const elapsed = performance.now() - dice.startT;
  const baseDelay = Math.max(0, YIELD_BASE_DELAY_MS - elapsed);
  let staggerIdx = 0;
  for (const tileIdx of dice.matchOrder) {
    const tile = board.tiles[tileIdx];
    const resource = TILE_TO_RESOURCE[tile.type];
    if (!resource) continue;
    const { x: tx, y: ty } = axialToPixel(tile, layout);
    // Find buildings on this tile's corners; settlement = 1, city = 2.
    const tileYields: number[] = [];
    for (let i = 0; i < 6; i++) {
      const [cx, cy] = hexCorner(tx, ty, layout.size, i);
      const kind = buildings.get(vertexKey(cx, cy));
      if (kind === "settlement") tileYields.push(1);
      else if (kind === "city") tileYields.push(2);
    }
    if (!tileYields.length) continue;
    const from = tileScreenCenter(tileIdx, board, layout, view, canvas);
    const to = resourceCellCenter(resource);
    let firstDelayForTile = -1;
    for (const count of tileYields) {
      for (let k = 0; k < count; k++) {
        const delay = baseDelay + staggerIdx * YIELD_STAGGER_MS;
        if (firstDelayForTile < 0) firstDelayForTile = delay;
        spawnResourceFly(resource, from.x, from.y, to.x, to.y, delay);
        staggerIdx++;
      }
    }
    setTimeout(() => {
      tileSheen.set(tileIdx, performance.now());
    }, firstDelayForTile);
  }
}

async function main() {
  const canvas = document.getElementById("board") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  mountResourceHud();
  renderResourceHud();
  const seedInput = document.getElementById("seed") as HTMLInputElement;
  const radiusInput = document.getElementById("radius") as HTMLInputElement;
  const mapStyleSelect = document.getElementById("mapStyle") as HTMLSelectElement;
  const imgScaleInput = document.getElementById("imgScale") as HTMLInputElement;
  const restartBtn = document.getElementById("restart-toggle") as HTMLButtonElement;
  const ruleAllVisibleInput = document.getElementById("ruleAllVisible") as HTMLInputElement;
  const ruleFogOfWarInput = document.getElementById("ruleFogOfWar") as HTMLInputElement;
  const ruleGuaranteed68Input = document.getElementById("ruleGuaranteed68") as HTMLInputElement;
  const rollBtn = document.getElementById("roll-toggle") as HTMLButtonElement;
  const numScaleInput = document.getElementById("numScale") as HTMLInputElement;
  const numOffXInput = document.getElementById("numOffX") as HTMLInputElement;
  const numOffYInput = document.getElementById("numOffY") as HTMLInputElement;
  const glowSpreadInput = document.getElementById("glowSpread") as HTMLInputElement;
  const glowFeatherInput = document.getElementById("glowFeather") as HTMLInputElement;
  const innerGlowSpreadInput = document.getElementById("innerGlowSpread") as HTMLInputElement;
  const innerGlowFeatherInput = document.getElementById("innerGlowFeather") as HTMLInputElement;
  const foamColorInput = document.getElementById("foamColor") as HTMLInputElement;
  const lakeFoamColorInput = document.getElementById("lakeFoamColor") as HTMLInputElement;
  const portGlowColorInput = document.getElementById("portGlowColor") as HTMLInputElement;
  const portGlowSizeInput = document.getElementById("portGlowSize") as HTMLInputElement;
  const portGlowFeatherInput = document.getElementById("portGlowFeather") as HTMLInputElement;
  const portGlowOpacityInput = document.getElementById("portGlowOpacity") as HTMLInputElement;
  const portGlowBlendInput = document.getElementById("portGlowBlend") as HTMLSelectElement;
  const portCenterOffsetInput = document.getElementById("portCenterOffset") as HTMLInputElement;
  const portItemsGapInput = document.getElementById("portItemsGap") as HTMLInputElement;
  const portIconSizeInput = document.getElementById("portIconSize") as HTMLInputElement;
  const portTextSizeInput = document.getElementById("portTextSize") as HTMLInputElement;
  const settlementScaleInput = document.getElementById("settlementScale") as HTMLInputElement;
  const settlementOffYInput = document.getElementById("settlementOffY") as HTMLInputElement;
  const cityScaleInput = document.getElementById("cityScale") as HTMLInputElement;
  const cityOffYInput = document.getElementById("cityOffY") as HTMLInputElement;
  const bridge30ScaleInput = document.getElementById("bridge30Scale") as HTMLInputElement;
  const bridge30OffXInput = document.getElementById("bridge30OffX") as HTMLInputElement;
  const bridge30OffYInput = document.getElementById("bridge30OffY") as HTMLInputElement;
  const bridge30RotInput = document.getElementById("bridge30Rot") as HTMLInputElement;
  const bridgeStraightScaleInput = document.getElementById("bridgeStraightScale") as HTMLInputElement;
  const bridgeStraightOffXInput = document.getElementById("bridgeStraightOffX") as HTMLInputElement;
  const bridgeStraightOffYInput = document.getElementById("bridgeStraightOffY") as HTMLInputElement;
  const bridgeStraightRotInput = document.getElementById("bridgeStraightRot") as HTMLInputElement;
  const thievesScaleInput = document.getElementById("thievesScale") as HTMLInputElement;
  const thievesOffYInput = document.getElementById("thievesOffY") as HTMLInputElement;
  const buildingHueInput = document.getElementById("buildingHue") as HTMLInputElement;
  const buildingSatInput = document.getElementById("buildingSat") as HTMLInputElement;
  const buildingLightInput = document.getElementById("buildingLight") as HTMLInputElement;
  const buildingBlendInput = document.getElementById("buildingBlend") as HTMLSelectElement;
  const pathWidthInput = document.getElementById("pathWidth") as HTMLInputElement;
  const pathBlendInput = document.getElementById("pathBlend") as HTMLSelectElement;
  const shadowBlendInput = document.getElementById("shadowBlend") as HTMLSelectElement;
  const shadowAngleInput = document.getElementById("shadowAngle") as HTMLInputElement;
  const shadowSpreadInput = document.getElementById("shadowSpread") as HTMLInputElement;
  const shadowFeatherInput = document.getElementById("shadowFeather") as HTMLInputElement;
  const shadowOpacityInput = document.getElementById("shadowOpacity") as HTMLInputElement;
  const hoverEnabledInput = document.getElementById("hoverEnabled") as HTMLInputElement;
  const hoverColorInput = document.getElementById("hoverColor") as HTMLInputElement;
  const hoverOffXInput = document.getElementById("hoverOffX") as HTMLInputElement;
  const hoverOffYInput = document.getElementById("hoverOffY") as HTMLInputElement;
  const hoverScaleInput = document.getElementById("hoverScale") as HTMLInputElement;
  const hoverOpacityInput = document.getElementById("hoverOpacity") as HTMLInputElement;
  const hoverFadeInInput = document.getElementById("hoverFadeIn") as HTMLInputElement;
  const hoverFadeOutInput = document.getElementById("hoverFadeOut") as HTMLInputElement;
  const hoverGlowSizeInput = document.getElementById("hoverGlowSize") as HTMLInputElement;
  const hoverFeatherInput = document.getElementById("hoverFeather") as HTMLInputElement;
  const hoverBlendInput = document.getElementById("hoverBlend") as HTMLSelectElement;
  const vignetteEnabledInput = document.getElementById("vignetteEnabled") as HTMLInputElement;
  const vignetteColorInput = document.getElementById("vignetteColor") as HTMLInputElement;
  const vignetteIntensityInput = document.getElementById("vignetteIntensity") as HTMLInputElement;
  const vignetteFeatherInput = document.getElementById("vignetteFeather") as HTMLInputElement;
  const vignetteScaleInput = document.getElementById("vignetteScale") as HTMLInputElement;
  const cloudsEnabledInput = document.getElementById("cloudsEnabled") as HTMLInputElement;
  const cloudColorInput = document.getElementById("cloudColor") as HTMLInputElement;
  const cloudOpacityInput = document.getElementById("cloudOpacity") as HTMLInputElement;
  const cloudDensityInput = document.getElementById("cloudDensity") as HTMLInputElement;
  const cloudScaleInput = document.getElementById("cloudScale") as HTMLInputElement;
  const cloudWindSpeedInput = document.getElementById("cloudWindSpeed") as HTMLInputElement;
  const cloudWindDriftInput = document.getElementById("cloudWindDrift") as HTMLInputElement;
  const cloudMorphSpeedInput = document.getElementById("cloudMorphSpeed") as HTMLInputElement;
  const cloudBlendInput = document.getElementById("cloudBlend") as HTMLSelectElement;
  const ruleMixedTradeInput = document.getElementById("ruleMixedTrade") as HTMLInputElement;
  const fogEnabledInput = document.getElementById("fogEnabled") as HTMLInputElement;
  const fogColorInput = document.getElementById("fogColor") as HTMLInputElement;
  const fogOpacityInput = document.getElementById("fogOpacity") as HTMLInputElement;
  const regenBtn = document.getElementById("regen") as HTMLButtonElement;

  const images = await loadImages();
  const portIcons = await loadPortIcons();
  const buildingImgs: BuildingImgs = {
    settlement: await loadImage(settlementUrl),
    settlementMask: await loadImage(settlementCmaskUrl),
    city: await loadImage(cityUrl),
    cityMask: await loadImage(cityCmaskUrl),
    bridge30up: await loadImage(bridge30upUrl),
    bridge30upMask: await loadImage(bridge30upCmaskUrl),
    bridge30down: await loadImage(bridge30downUrl),
    bridge30downMask: await loadImage(bridge30downCmaskUrl),
    bridgeStraight: await loadImage(bridgeVerticalUrl),
    bridgeStraightMask: await loadImage(bridgeVerticalCmaskUrl),
    thieves: await loadImage(thievesUrl),
  };

  let board = generateBoard(
    Number(seedInput.value) || 0,
    Number(radiusInput.value) || undefined,
    mapStyleSelect.value as MapStyle
  );
  thievesTileIdx = defaultThievesIdx(board);
  const view: View = { tx: 0, ty: 0, zoom: 1 };
  let dpr = window.devicePixelRatio || 1;

  function resize() {
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    render();
  }

  // Camera limits driven by the playable area's actual pixel bounds.
  // - minZoom: keep the playable area at least PLAY_MIN_ON_SCREEN of the
  //   shorter viewport edge so it can't be shrunk into nothing.
  // - pan clamp: leave at least PAN_MARGIN of overlap between the board bbox
  //   and the viewport so the user can't drag the board fully off-screen.
  const PLAY_MIN_ON_SCREEN = 0.85;
  // Min fraction of the board's *shorter* on-screen dimension that must remain visible.
  const PAN_KEEP_VISIBLE = 0.6;

  function computeMinZoom(layout: HexLayout, cssW: number, cssH: number): number {
    const all = [...board.tiles, ...board.oceans];
    if (!all.length) return 0.1;
    const bbox = hexBounds(all, layout);
    const minDim = Math.min(cssW, cssH);
    const boardMin = Math.min(bbox.width, bbox.height);
    return (minDim * PLAY_MIN_ON_SCREEN) / boardMin;
  }

  function clampView(layout: HexLayout, cssW: number, cssH: number) {
    const all = [...board.tiles, ...board.oceans];
    if (!all.length) return;
    const bbox = hexBounds(all, layout);
    const minZoom = computeMinZoom(layout, cssW, cssH);
    view.zoom = Math.max(minZoom, Math.min(8, view.zoom));
    // The reachable world region is a fixed rectangle around the board, sized
    // by panSlack. At any zoom, the visible viewport must stay inside this rect
    // — so zooming in lets you pan further (more world coords per screen pixel)
    // but you still can't reveal anything that wasn't reachable at min zoom.
    const panSlack = 1 - PAN_KEEP_VISIBLE;
    const cX = (bbox.minX + bbox.maxX) / 2;
    const cY = (bbox.minY + bbox.maxY) / 2;
    const halfBoundsX = bbox.width * (0.5 + panSlack);
    const halfBoundsY = bbox.height * (0.5 + panSlack);
    const vpW = cssW / view.zoom;
    const vpH = cssH / view.zoom;
    const vcX = (cssW / 2 - view.tx) / view.zoom;
    const vcY = (cssH / 2 - view.ty) / view.zoom;
    const newVcX = vpW >= halfBoundsX * 2 ? cX : Math.max(cX - halfBoundsX + vpW / 2, Math.min(cX + halfBoundsX - vpW / 2, vcX));
    const newVcY = vpH >= halfBoundsY * 2 ? cY : Math.max(cY - halfBoundsY + vpH / 2, Math.min(cY + halfBoundsY - vpH / 2, vcY));
    view.tx = cssW / 2 - newVcX * view.zoom;
    view.ty = cssH / 2 - newVcY * view.zoom;
  }

  function render() {
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    const layout = fitLayout(board, cssW, cssH);
    clampView(layout, cssW, cssH);
    const imgScale = Number(imgScaleInput.value) || 1;
    const numOpts = {
      scale: Number(numScaleInput.value) || 0,
      offX: Number(numOffXInput.value) || 0,
      offY: Number(numOffYInput.value) || 0,
    };
    const glowOpts = {
      spread: Number(glowSpreadInput.value) || 0,
      feather: Number(glowFeatherInput.value) || 0,
      innerSpread: Number(innerGlowSpreadInput.value) || 0,
      innerFeather: Number(innerGlowFeatherInput.value) || 0,
    };
    const beachOpts = {
      foamColor: foamColorInput.value || "#c5cdd8",
      lakeFoamColor: lakeFoamColorInput.value || "#4a6f8a",
    };
    const cloudOpts: CloudOpts = {
      enabled: cloudsEnabledInput.checked,
      color: cloudColorInput.value || "#000000",
      opacity: Number(cloudOpacityInput.value) || 0,
      density: Math.min(0.99, Math.max(0, Number(cloudDensityInput.value) || 0)),
      scale: Number(cloudScaleInput.value) || 256,
      windSpeed: Number(cloudWindSpeedInput.value) || 0,
      windDrift: Number(cloudWindDriftInput.value) || 0,
      morphSpeed: Number(cloudMorphSpeedInput.value) || 0,
      blend: (cloudBlendInput.value as GlobalCompositeOperation) || "screen",
    };
    const vignetteOpts: VignetteOpts = {
      enabled: vignetteEnabledInput.checked,
      color: vignetteColorInput.value || "#000000",
      intensity: Math.min(1, Math.max(0, Number(vignetteIntensityInput.value) || 0)),
      feather: Math.min(1, Math.max(0, Number(vignetteFeatherInput.value) || 0)),
      scale: Math.max(0.1, Number(vignetteScaleInput.value) || 1),
    };
    const portOpts: PortOpts = {
      glowColor: portGlowColorInput.value || "#fab45a",
      glowSize: Math.max(0.1, Number(portGlowSizeInput.value) || 2.6),
      glowFeather: Math.min(1, Math.max(0, Number(portGlowFeatherInput.value) || 0.55)),
      glowOpacity: Math.min(1, Math.max(0, Number(portGlowOpacityInput.value) || 0.55)),
      glowBlend: (portGlowBlendInput.value as GlobalCompositeOperation) || "source-over",
      centerOffset: Number(portCenterOffsetInput.value) || 0,
      itemsGap: Math.max(0, Number(portItemsGapInput.value) || 0),
      iconSize: Math.max(0, Number(portIconSizeInput.value) || 0),
      textSize: Math.max(0.1, Number(portTextSizeInput.value) || 0.9),
    };
    const hoverOpts: HoverOpts = {
      enabled: hoverEnabledInput.checked,
      color: hoverColorInput.value || "#ffffff",
      offX: Number(hoverOffXInput.value) || 0,
      offY: Number(hoverOffYInput.value) || 0,
      scale: Math.max(0.05, Number(hoverScaleInput.value) || 0.5),
      opacity: Math.min(1, Math.max(0, Number(hoverOpacityInput.value) || 0.9)),
      fadeIn: Math.max(0.001, Number(hoverFadeInInput.value) || 0.15),
      fadeOut: Math.max(0.001, Number(hoverFadeOutInput.value) || 0.25),
      glowSize: Math.max(0.1, Number(hoverGlowSizeInput.value) || 1.5),
      feather: Math.min(1, Math.max(0, Number(hoverFeatherInput.value) || 0.5)),
      blend: (hoverBlendInput.value as GlobalCompositeOperation) || "source-over",
    };
    const buildingOpts = {
      settlementScale: Math.max(0.05, Number(settlementScaleInput.value) || 0.55),
      settlementOffY: Number(settlementOffYInput.value) || 0,
      cityScale: Math.max(0.05, Number(cityScaleInput.value) || 0.65),
      cityOffY: Number(cityOffYInput.value) || 0,
      bridgeTuning: ((): Record<BridgeVariant, BridgeTuning> => {
        // Single 30° tuning auto-mirrors across the vertical axis: 30down is the
        // reflection of 30up (negate X offset and rotation, keep Y/scale).
        const scale30 = Math.max(0.05, Number(bridge30ScaleInput.value) || 0.6);
        const ox = Number(bridge30OffXInput.value) || 0;
        const oy = Number(bridge30OffYInput.value) || 0;
        const rot = Number(bridge30RotInput.value) || 0;
        return {
          "30up": { scale: scale30, offX: ox, offY: oy, rotDeg: rot },
          "30down": { scale: scale30, offX: -ox, offY: oy, rotDeg: -rot },
          straight: {
            scale: Math.max(0.05, Number(bridgeStraightScaleInput.value) || 0.6),
            offX: Number(bridgeStraightOffXInput.value) || 0,
            offY: Number(bridgeStraightOffYInput.value) || 0,
            rotDeg: Number(bridgeStraightRotInput.value) || 0,
          },
        };
      })(),
      color: hslToHex(
        Number(buildingHueInput.value) || 0,
        Number(buildingSatInput.value) || 70,
        Number(buildingLightInput.value) || 50
      ),
      blend: (buildingBlendInput.value as GlobalCompositeOperation) || "overlay",
      pathWidth: Math.max(0, Number(pathWidthInput.value) || 0),
      pathBlend: (pathBlendInput.value as GlobalCompositeOperation) || "source-over",
      shadowBlend: (shadowBlendInput.value as GlobalCompositeOperation) || "source-over",
      shadowAngleDeg: Number(shadowAngleInput.value) || 0,
      shadowSpread: Math.max(0, Number(shadowSpreadInput.value) || 0),
      shadowFeather: Math.max(0, Number(shadowFeatherInput.value) || 0),
      shadowOpacity: Math.max(0, Math.min(1, Number(shadowOpacityInput.value) || 0)),
      buildingScale: buildingScaleAt(performance.now(), board.tiles.length),
      thievesScale: Math.max(0, Number(thievesScaleInput.value) || 0),
      thievesOffY: Number(thievesOffYInput.value) || 0,
      thievesPos: (thievesTileIdx >= 0
        && board.tiles[thievesTileIdx]
        && tileRevealProgress(thievesTileIdx, performance.now(), board.tiles.length) >= 1)
        ? axialToPixel(board.tiles[thievesTileIdx], layout)
        : null,
    };
    const placementGraph = buildPlacementGraph(board, layout);
    const validV = applyGuaranteed68IfActive(validSettlementVertices(placementGraph), board, layout);
    const validC = validCityVertices();
    const validE = validBridgeEdges(placementGraph);
    const mouseWX = mouseX < 0 ? -1e9 : (mouseX - view.tx) / view.zoom;
    const mouseWY = mouseY < 0 ? -1e9 : (mouseY - view.ty) / view.zoom;
    const hoverSnap = snapPlacementHover(placementGraph, validV, validC, validE, mouseWX, mouseWY, layout.size);
    const placementOpts = {
      graph: placementGraph,
      hints: {
        step: placementStep,
        vertices: validV,
        cities: validC,
        edges: validE,
        hover: hoverSnap,
      },
      buildingImgs,
      color: buildingOpts.color,
      blend: buildingOpts.blend,
      bridgeTuning: buildingOpts.bridgeTuning,
      buildingScale: buildingOpts.buildingScale,
      settlementOffY: Number(settlementOffYInput.value) || 0,
    };
    const fogOpts: FogOpts = {
      enabled: fogEnabledInput.checked,
      color: fogColorInput.value || "#3d3d3d",
      opacity: Math.min(1, Math.max(0, Number(fogOpacityInput.value) || 0)),
    };
    draw(ctx, board, layout, images, portIcons, buildingImgs, imgScale, view, dpr, numOpts, glowOpts, beachOpts, portOpts, buildingOpts, hoverOpts, vignetteOpts, cloudOpts, placementOpts, fogOpts, performance.now());
  }

  // Animation loop — drives cloud motion. Cheap to leave running.
  let lastTickT = 0;
  function tick(t: number) {
    const dt = lastTickT === 0 ? 0 : Math.min(0.1, (t - lastTickT) / 1000);
    lastTickT = t;
    let needsRender = false;
    if (revealAnimationRunning(t, board.tiles.length)) needsRender = true;
    if (diceAnimationRunning(t)) needsRender = true;
    if (matchPopAnimationRunning(t)) needsRender = true;
    if (tileSheenAnimationRunning()) needsRender = true;
    if (buildingScaleAnimationRunning(t, board.tiles.length)) needsRender = true;
    if (placementBounceAnimationRunning()) needsRender = true;
    // Placement-hint pulse + marching-ant dashes need a steady redraw whenever
    // hints are on-screen: during the forced opening, or while the cursor is
    // over the canvas in free mode.
    if (placementStep !== "free" || mouseX >= 0) needsRender = true;

    // Hover: only active once the reveal animation has finished.
    const prevHoverIdx = hover.idx;
    const hoverGateOpen = revealMode === "default"
      ? !reveal.hidden && !revealAnimationRunning(t, board.tiles.length)
      : true; // per-tile gate applied below
    if (hoverEnabledInput.checked && hoverGateOpen) {
      const layout = fitLayout(board, canvas.clientWidth, canvas.clientHeight);
      const tickNumOpts = {
        scale: Number(numScaleInput.value) || 0,
        offX: Number(numOffXInput.value) || 0,
        offY: Number(numOffYInput.value) || 0,
      };
      const idx = mouseX < 0 ? -1 : findHoveredNumberTokenTileIdx(board, layout, view, mouseX, mouseY, tickNumOpts);
      // In fog / all-visible modes, don't reveal a tile's resource type via the
      // hover icon if the tile itself hasn't flipped face-up yet.
      const tileVisible = revealMode === "default"
        ? true
        : idx >= 0 && tileRevealProgress(idx, t, board.tiles.length) >= 1;
      const valid = idx >= 0 && board.tiles[idx].type !== "desert" && tileVisible ? idx : -1;
      if (valid === -1) {
        hover.pending = -1;
        hover.target = 0;
      } else if (hover.idx === -1 || hover.alpha === 0) {
        // No icon currently shown — adopt the new tile and fade in.
        hover.idx = valid;
        hover.pending = -1;
        hover.target = 1;
      } else if (valid === hover.idx) {
        // Still on the same tile — continue fading in.
        hover.pending = -1;
        hover.target = 1;
      } else {
        // Moving to a different tile — fade out current, queue the next.
        hover.pending = valid;
        hover.target = 0;
      }
    } else {
      hover.pending = -1;
      hover.target = 0;
    }
    if (hover.idx !== prevHoverIdx) needsRender = true;
    const fadeIn = Math.max(0.001, Number(hoverFadeInInput.value) || 0.15);
    const fadeOut = Math.max(0.001, Number(hoverFadeOutInput.value) || 0.25);
    if (hover.alpha !== hover.target) {
      const rate = hover.target > hover.alpha ? 1 / fadeIn : 1 / fadeOut;
      const step = rate * dt;
      if (hover.target > hover.alpha) hover.alpha = Math.min(hover.target, hover.alpha + step);
      else hover.alpha = Math.max(hover.target, hover.alpha - step);
      needsRender = true;
      if (hover.target === 0 && hover.alpha <= 0) {
        if (hover.pending !== -1) {
          // Finished fading out the previous — swap to the queued tile and fade in.
          hover.idx = hover.pending;
          hover.pending = -1;
          hover.target = 1;
        } else {
          hover.idx = -1;
        }
      }
    }
    if (cloudsEnabledInput.checked) {
      const cloudOpts: CloudOpts = {
        enabled: true,
        color: cloudColorInput.value || "#000000",
        opacity: Number(cloudOpacityInput.value) || 0,
        density: Math.min(0.99, Math.max(0, Number(cloudDensityInput.value) || 0)),
        scale: Number(cloudScaleInput.value) || 256,
        windSpeed: Number(cloudWindSpeedInput.value) || 0,
        windDrift: Number(cloudWindDriftInput.value) || 0,
        morphSpeed: Number(cloudMorphSpeedInput.value) || 0,
        blend: (cloudBlendInput.value as GlobalCompositeOperation) || "screen",
      };
      updateCloudWind(cloudOpts, t);
      needsRender = true;
    }
    if (needsRender) render();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  function restartGameState() {
    buildings.clear();
    bridges.clear();
    for (const r of RESOURCE_ORDER) resourceCounts[r] = 0;
    renderResourceHud();
    placementStep = "initial-s1";
    lastInitialSettlementKey = null;
    placementBounce.clear();
    tileSheen.clear();
    dice.matchOrder = [];
    dice.visible = false;
    thievesTileIdx = defaultThievesIdx(board);
    const layout = fitLayout(board, canvas.clientWidth, canvas.clientHeight);
    rebuildRevealOrders(board);
    reveal.animStart = performance.now();
    applyRevealModeReset(board, layout);
    refreshPassivesAndTrade();
  }

  function regen() {
    board = generateBoard(
      Number(seedInput.value) || 0,
      Number(radiusInput.value) || undefined,
      mapStyleSelect.value as MapStyle
    );
    restartGameState();
    render();
  }

  // pan
  let dragging = false;
  let lastX = 0, lastY = 0;
  let dragDist = 0;
  canvas.addEventListener("mousedown", (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    dragDist = 0;
    canvas.style.cursor = "grabbing";
  });
  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    view.tx += dx;
    view.ty += dy;
    dragDist += Math.hypot(dx, dy);
    lastX = e.clientX;
    lastY = e.clientY;
    render();
  });
  window.addEventListener("mouseup", () => {
    dragging = false;
    canvas.style.cursor = "grab";
  });
  canvas.style.cursor = "grab";

  // Track mouse position and the currently-hovered tile. Only effective once
  // the reveal animation has fully completed.
  let mouseX = -1, mouseY = -1;
  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
  });
  canvas.addEventListener("mouseleave", () => { mouseX = -1; mouseY = -1; });

  // mac trackpad: two-finger drag => pan (wheel without ctrlKey),
  // pinch => zoom (wheel with ctrlKey set by the browser). Also handles mouse wheel zoom.
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (e.ctrlKey) {
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      // Resolve min zoom from the current layout so the cursor-anchor math
      // uses the zoom we'll actually end up at (otherwise clamping drifts pan).
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      const layout = fitLayout(board, cssW, cssH);
      const minZoom = computeMinZoom(layout, cssW, cssH);
      const factor = Math.exp(-e.deltaY * 0.01);
      const newZoom = Math.min(8, Math.max(minZoom, view.zoom * factor));
      const k = newZoom / view.zoom;
      view.tx = cx - k * (cx - view.tx);
      view.ty = cy - k * (cy - view.ty);
      view.zoom = newZoom;
    } else {
      view.tx -= e.deltaX;
      view.ty -= e.deltaY;
    }
    render();
  }, { passive: false });

  regenBtn.addEventListener("click", () => {
    seedInput.value = String(Math.floor(Math.random() * 1_000_000));
    regen();
  });
  seedInput.addEventListener("input", regen);
  radiusInput.addEventListener("input", regen);
  mapStyleSelect.addEventListener("change", regen);
  imgScaleInput.addEventListener("input", render);
  rollBtn.addEventListener("click", () => {
    rollDice(board);
    const layout = fitLayout(board, canvas.clientWidth, canvas.clientHeight);
    scheduleRollYields(board, layout, view, canvas);
    render();
  });
  canvas.addEventListener("click", (e) => {
    // Suppress click after a real drag.
    if (dragDist > 4) return;
    if (dice.visible && !diceAnimationRunning(performance.now())) {
      dice.visible = false;
      render();
      return;
    }
    // Default mode: block placement while the global reveal animation is
    // running so clicks can't land on still-flipping cards. Fog and all-visible
    // modes flip individual tiles asynchronously, so don't lock the UI.
    if (revealMode === "default" && revealAnimationRunning(performance.now(), board.tiles.length)) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const wx = (mx - view.tx) / view.zoom;
    const wy = (my - view.ty) / view.zoom;
    const layout = fitLayout(board, canvas.clientWidth, canvas.clientHeight);
    const graph = buildPlacementGraph(board, layout);
    const validV = applyGuaranteed68IfActive(validSettlementVertices(graph), board, layout);
    const validC = validCityVertices();
    const validE = validBridgeEdges(graph);
    const snap = snapPlacementHover(graph, validV, validC, validE, wx, wy, layout.size);
    if (!snap) return;
    if (snap.kind === "vertex") {
      const v = graph.vertices.get(snap.key);
      if (!v) return;
      if (validC.has(snap.key)) {
        // Upgrade settlement → city (free mode only — validCityVertices is
        // empty during the opening sequence).
        buildings.set(snap.key, "city");
        spendForBuild("city");
      } else {
        buildings.set(snap.key, "settlement");
        if (placementStep === "initial-s1") {
          lastInitialSettlementKey = snap.key;
          placementStep = "initial-b1";
        } else if (placementStep === "initial-s2") {
          lastInitialSettlementKey = snap.key;
          placementStep = "initial-b2";
        } else {
          spendForBuild("settlement");
        }
      }
      placementBounce.set(snap.key, performance.now());
    } else {
      const e2 = graph.edges.get(snap.key);
      if (!e2) return;
      bridges.set(snap.key, { variant: e2.variant, a: e2.a, b: e2.b });
      placementBounce.set(snap.key, performance.now());
      if (placementStep === "initial-b1") {
        placementStep = "initial-s2";
        lastInitialSettlementKey = null;
      } else if (placementStep === "initial-b2") {
        placementStep = "free";
        lastInitialSettlementKey = null;
        // Opening complete — in default mode flip every tile face-up via the
        // staggered global animation. In fog mode flip the tiles the player
        // has already explored (settlements + bridge endpoints) and leave the
        // rest face-down. All-visible has nothing to do.
        if (revealMode === "default") {
          rebuildRevealOrders(board);
          reveal.animStart = performance.now();
          reveal.hidden = false;
        } else if (revealMode === "fog") {
          const layout2 = fitLayout(board, canvas.clientWidth, canvas.clientHeight);
          const t = performance.now();
          for (const i of exploredTileIndices(board, layout2)) {
            if (!tileRevealAt.has(i)) tileRevealAt.set(i, t);
          }
        }
      } else {
        spendForBuild("bridge");
      }
    }
    refreshFogReveals(board, fitLayout(board, canvas.clientWidth, canvas.clientHeight));
    refreshPassivesAndTrade();
    render();
  });
  restartBtn.addEventListener("click", () => {
    restartGameState();
    render();
  });
  numScaleInput.addEventListener("input", render);
  numOffXInput.addEventListener("input", render);
  numOffYInput.addEventListener("input", render);
  glowSpreadInput.addEventListener("input", render);
  glowFeatherInput.addEventListener("input", render);
  innerGlowSpreadInput.addEventListener("input", render);
  innerGlowFeatherInput.addEventListener("input", render);
  foamColorInput.addEventListener("input", render);
  lakeFoamColorInput.addEventListener("input", render);
  for (const el of [portGlowColorInput, portGlowSizeInput, portGlowFeatherInput, portGlowOpacityInput, portGlowBlendInput, portCenterOffsetInput, portItemsGapInput, portIconSizeInput, portTextSizeInput, settlementScaleInput, settlementOffYInput, cityScaleInput, cityOffYInput, bridge30ScaleInput, bridge30OffXInput, bridge30OffYInput, bridge30RotInput, bridgeStraightScaleInput, bridgeStraightOffXInput, bridgeStraightOffYInput, bridgeStraightRotInput, thievesScaleInput, thievesOffYInput, buildingHueInput, buildingSatInput, buildingLightInput, buildingBlendInput, pathWidthInput, pathBlendInput, shadowBlendInput, shadowAngleInput, shadowSpreadInput, shadowFeatherInput, shadowOpacityInput]) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  }
  for (const el of [hoverEnabledInput, hoverColorInput, hoverOffXInput, hoverOffYInput, hoverScaleInput, hoverOpacityInput, hoverFadeInInput, hoverFadeOutInput, hoverGlowSizeInput, hoverFeatherInput, hoverBlendInput]) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  }
  for (const el of [vignetteEnabledInput, vignetteColorInput, vignetteIntensityInput, vignetteFeatherInput, vignetteScaleInput, cloudsEnabledInput, cloudColorInput, cloudOpacityInput, cloudDensityInput, cloudScaleInput, cloudWindSpeedInput, cloudWindDriftInput, cloudMorphSpeedInput, cloudBlendInput, fogEnabledInput, fogColorInput, fogOpacityInput]) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  }
  window.addEventListener("resize", resize);

  // --- Bank trade UI + passives badges ---
  const tradeToggleBtn = document.getElementById("trade-toggle") as HTMLButtonElement;
  const tradeBackdrop = document.getElementById("trade-backdrop") as HTMLDivElement;
  const tradeGiveRow = document.getElementById("trade-give") as HTMLDivElement;
  const tradeGetRow = document.getElementById("trade-get") as HTMLDivElement;
  const tradeSummaryEl = document.getElementById("trade-summary") as HTMLDivElement;
  const tradeCancelBtn = document.getElementById("trade-cancel") as HTMLButtonElement;
  const tradeResetBtn = document.getElementById("trade-reset") as HTMLButtonElement;
  const tradeConfirmBtn = document.getElementById("trade-confirm") as HTMLButtonElement;
  const passivesPanel = document.getElementById("passives-panel") as HTMLDivElement;

  // Standard Catan: pick one give resource, give N of it (rate determined by
  // ports), receive 1 of another. Mixed-pile state is also kept so the
  // future house-rule variant can be toggled without a rewrite.
  const emptyPile = (): Record<ResourceKind, number> => ({ wood: 0, brick: 0, sheep: 0, wheat: 0, stone: 0 });
  let tradeGiveSingle: ResourceKind | null = null;
  let tradeGivePile: Record<ResourceKind, number> = emptyPile();
  let tradeGet: ResourceKind | null = null;

  function pileTotal(p: Record<ResourceKind, number>): number {
    let t = 0;
    for (const r of RESOURCE_ORDER) t += p[r];
    return t;
  }
  function pileTypes(p: Record<ResourceKind, number>): ResourceKind[] {
    return RESOURCE_ORDER.filter((r) => p[r] > 0);
  }
  // House-rule helper for the "mixed pile" variant: cheapest rate the pile is
  // compatible with given owned ports. Kept here so the lobby can flip
  // BANK_TRADE_RULE later without a rewrite.
  function pileTargetRate(
    p: Record<ResourceKind, number>,
    ports: Set<PortType>,
  ): { rate: 2 | 3 | 4; label: string } {
    const types = pileTypes(p);
    const total = pileTotal(p);
    if (types.length === 1 && ports.has(RESOURCE_TO_PORT_TYPE[types[0]]) && total <= 2) {
      return { rate: 2, label: `2:1 ${RESOURCE_LABELS[types[0]].toLowerCase()} port` };
    }
    if (ports.has("3:1")) return { rate: 3, label: "3:1 generic port" };
    return { rate: 4, label: "4:1 default" };
  }

  function currentPorts(): Set<PortType> {
    return ownedPortTypes(board, fitLayout(board, canvas.clientWidth, canvas.clientHeight));
  }

  function makeTradeBtn(k: ResourceKind): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.className = "trade-btn";
    btn.type = "button";
    btn.dataset.res = k;
    btn.title = RESOURCE_LABELS[k];
    const img = document.createElement("img");
    img.src = RESOURCE_ICONS[k];
    img.alt = "";
    img.draggable = false;
    btn.appendChild(img);
    const stock = document.createElement("span");
    stock.className = "stock";
    btn.appendChild(stock);
    return btn;
  }

  function mountGiveRow() {
    tradeGiveRow.innerHTML = "";
    for (const k of RESOURCE_ORDER) {
      const btn = makeTradeBtn(k);
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        if (BANK_TRADE_RULE === "standard") {
          tradeGiveSingle = k;
          if (tradeGet === k) tradeGet = null;
        } else {
          tradeGivePile[k]++;
        }
        refreshTradeUI();
      });
      btn.addEventListener("contextmenu", (e) => {
        // Right-click only meaningful in the mixed-pile house rule.
        if (BANK_TRADE_RULE !== "mixed") return;
        e.preventDefault();
        if (tradeGivePile[k] > 0) {
          tradeGivePile[k]--;
          refreshTradeUI();
        }
      });
      tradeGiveRow.appendChild(btn);
    }
  }
  function mountGetRow() {
    tradeGetRow.innerHTML = "";
    for (const k of RESOURCE_ORDER) {
      const btn = makeTradeBtn(k);
      const stock = btn.querySelector(".stock")!;
      stock.textContent = "";
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        tradeGet = k;
        refreshTradeUI();
      });
      tradeGetRow.appendChild(btn);
    }
  }

  function refreshTradeUI() {
    if (BANK_TRADE_RULE === "standard") refreshStandardTradeUI();
    else refreshMixedTradeUI();
  }

  function refreshStandardTradeUI() {
    const ports = currentPorts();
    for (const child of Array.from(tradeGiveRow.children) as HTMLButtonElement[]) {
      const res = child.dataset.res as ResourceKind;
      const rate = tradeRateFor(res, ports);
      const stock = resourceCounts[res];
      const stockSpan = child.querySelector(".stock")!;
      stockSpan.textContent = `${stock} (× ${rate})`;
      // Rate pill — only visible when the player benefits from a port for
      // this resource.
      let pill = child.querySelector(".rate-pill") as HTMLSpanElement | null;
      if (rate < 4) {
        if (!pill) {
          pill = document.createElement("span");
          pill.className = "rate-pill";
          child.appendChild(pill);
        }
        pill.textContent = `${rate}:1`;
        pill.classList.toggle("fav", rate === 2);
        pill.classList.toggle("mid", rate === 3);
      } else if (pill) {
        pill.remove();
      }
      // Strip mixed-mode UI leftovers in case the rule was just flipped.
      child.querySelector(".pile-badge")?.remove();
      child.classList.remove("has-pile");
      child.classList.toggle("selected", tradeGiveSingle === res);
      child.disabled = stock < rate;
      if (child.disabled && tradeGiveSingle === res) tradeGiveSingle = null;
    }
    for (const child of Array.from(tradeGetRow.children) as HTMLButtonElement[]) {
      const res = child.dataset.res as ResourceKind;
      child.classList.toggle("selected", tradeGet === res);
      // Can't receive the same resource you're giving.
      child.disabled = tradeGiveSingle === res;
      if (child.disabled && tradeGet === res) tradeGet = null;
    }
    if (tradeGiveSingle) {
      const rate = tradeRateFor(tradeGiveSingle, ports);
      tradeSummaryEl.innerHTML = `Give <span class="rate">${rate} × ${RESOURCE_LABELS[tradeGiveSingle].toLowerCase()}</span> for 1 of your choice.`;
    } else {
      tradeSummaryEl.textContent = "Pick what to give.";
    }
    const ok = tradeGiveSingle != null && tradeGet != null && tradeGiveSingle !== tradeGet
      && resourceCounts[tradeGiveSingle] >= tradeRateFor(tradeGiveSingle, ports);
    tradeConfirmBtn.disabled = !ok;
    tradeResetBtn.style.display = "none";
  }

  function refreshMixedTradeUI() {
    const ports = currentPorts();
    const { rate, label } = pileTargetRate(tradeGivePile, ports);
    const total = pileTotal(tradeGivePile);

    for (const child of Array.from(tradeGiveRow.children) as HTMLButtonElement[]) {
      const res = child.dataset.res as ResourceKind;
      const pileCount = tradeGivePile[res];
      const stock = resourceCounts[res];
      const stockSpan = child.querySelector(".stock")!;
      stockSpan.textContent = String(stock);
      let badge = child.querySelector(".pile-badge") as HTMLSpanElement | null;
      if (pileCount > 0) {
        if (!badge) {
          badge = document.createElement("span");
          badge.className = "pile-badge";
          child.appendChild(badge);
        }
        badge.textContent = String(pileCount);
        badge.classList.remove("hidden");
      } else if (badge) {
        badge.classList.add("hidden");
      }
      child.classList.toggle("has-pile", pileCount > 0);
      const wouldExceed = total >= rate;
      child.disabled = pileCount >= stock || wouldExceed;
    }

    for (const child of Array.from(tradeGetRow.children) as HTMLButtonElement[]) {
      const res = child.dataset.res as ResourceKind;
      child.classList.toggle("selected", tradeGet === res);
      child.disabled = tradeGivePile[res] > 0;
      if (child.disabled && tradeGet === res) tradeGet = null;
    }

    tradeSummaryEl.innerHTML = total === 0
      ? `Best rate available: <span class="rate">${label}</span>.`
      : `Giving <span class="rate">${total} / ${rate}</span> — ${label}`;
    tradeConfirmBtn.disabled = !(total === rate && tradeGet != null);
    tradeResetBtn.style.display = "";
    tradeResetBtn.disabled = total === 0;
  }

  mountGiveRow();
  mountGetRow();

  function openTrade() {
    tradeGiveSingle = null;
    tradeGivePile = emptyPile();
    tradeGet = null;
    tradeBackdrop.classList.remove("hidden");
    refreshTradeUI();
  }
  function closeTrade() {
    tradeBackdrop.classList.add("hidden");
  }

  tradeToggleBtn.addEventListener("click", openTrade);
  tradeCancelBtn.addEventListener("click", closeTrade);
  tradeBackdrop.addEventListener("click", (e) => {
    if (e.target === tradeBackdrop) closeTrade();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !tradeBackdrop.classList.contains("hidden")) closeTrade();
  });
  tradeResetBtn.addEventListener("click", () => {
    tradeGivePile = emptyPile();
    refreshTradeUI();
  });
  tradeConfirmBtn.addEventListener("click", () => {
    if (!tradeGet) return;
    const ports = currentPorts();
    if (BANK_TRADE_RULE === "standard") {
      if (!tradeGiveSingle || tradeGiveSingle === tradeGet) return;
      const rate = tradeRateFor(tradeGiveSingle, ports);
      if (resourceCounts[tradeGiveSingle] < rate) return;
      resourceCounts[tradeGiveSingle] -= rate;
    } else {
      const { rate } = pileTargetRate(tradeGivePile, ports);
      if (pileTotal(tradeGivePile) !== rate) return;
      for (const r of RESOURCE_ORDER) {
        const give = tradeGivePile[r];
        if (give > 0) resourceCounts[r] = Math.max(0, resourceCounts[r] - give);
      }
      tradeGivePile = emptyPile();
    }
    resourceCounts[tradeGet] += 1;
    const gainedRes = tradeGet;
    tradeGiveSingle = null;
    tradeGet = null;
    renderResourceHud();
    bumpResourceCell(gainedRes);
    refreshTradeUI();
  });

  ruleMixedTradeInput.addEventListener("change", () => {
    BANK_TRADE_RULE = ruleMixedTradeInput.checked ? "mixed" : "standard";
    // Reset both modes' state to avoid stale selections leaking across rules.
    tradeGiveSingle = null;
    tradeGivePile = emptyPile();
    tradeGet = null;
    refreshTradeUI();
  });

  function applyRevealModeFromInputs() {
    // Fog wins if both checked. The picked mode resets reveal bookkeeping so
    // the new rule kicks in immediately.
    if (ruleFogOfWarInput.checked) revealMode = "fog";
    else if (ruleAllVisibleInput.checked) revealMode = "all-visible";
    else revealMode = "default";
    const layout = fitLayout(board, canvas.clientWidth, canvas.clientHeight);
    applyRevealModeReset(board, layout);
    render();
  }
  ruleAllVisibleInput.addEventListener("change", () => {
    if (ruleAllVisibleInput.checked) ruleFogOfWarInput.checked = false;
    applyRevealModeFromInputs();
  });
  ruleFogOfWarInput.addEventListener("change", () => {
    if (ruleFogOfWarInput.checked) ruleAllVisibleInput.checked = false;
    applyRevealModeFromInputs();
  });
  ruleGuaranteed68Input.addEventListener("change", () => {
    ruleGuaranteed68 = ruleGuaranteed68Input.checked;
    render();
  });

  function renderPassives() {
    const ports = currentPorts();
    passivesPanel.innerHTML = "";
    for (const res of RESOURCE_ORDER) {
      if (!ports.has(RESOURCE_TO_PORT_TYPE[res])) continue;
      const badge = document.createElement("div");
      badge.className = "badge";
      badge.title = `${RESOURCE_LABELS[res]} 2:1 port`;
      const img = document.createElement("img");
      img.src = RESOURCE_ICONS[res];
      img.draggable = false;
      badge.appendChild(img);
      const ratio = document.createElement("span");
      ratio.className = "ratio";
      ratio.textContent = "2:1";
      badge.appendChild(ratio);
      passivesPanel.appendChild(badge);
    }
    if (ports.has("3:1")) {
      const badge = document.createElement("div");
      badge.className = "badge generic";
      badge.title = "Generic 3:1 port";
      badge.innerHTML = '<span class="ratio">3:1</span><span>any</span>';
      passivesPanel.appendChild(badge);
    }
    passivesPanel.classList.toggle("hidden", passivesPanel.children.length === 0);
  }
  onResourcesChanged = refreshTradeUI;
  refreshPassivesAndTrade = () => { renderPassives(); refreshTradeUI(); };
  renderPassives();

  resize();
  console.log(`board: seed=${board.seed} radius=${board.radius} tiles=${board.tiles.length}`);
}

main();
