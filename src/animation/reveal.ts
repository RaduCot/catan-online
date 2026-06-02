import { Board } from "../board";
import { HexLayout } from "../hex";
import { easeOutBack } from "../utils/easing";
import { getPlacementStep, exploredTileIndices } from "../game/placement";

// Reveal animation state. Cards start hidden; when the user clicks "reveal
// board" the tiles flip up one by one (staggered) and once they're all visible
// the numbers appear in the same fashion. Toggling back hides everything
// instantly. `tileOrder` and `numberOrder` are randomised permutations of the
// tile indices so the reveal isn't always in the same direction.
export const TILE_REVEAL_STAGGER = 0.06;
export const TILE_FLIP_DURATION = 0.55;
export const NUMBER_REVEAL_STAGGER = 0.05;
export const NUMBER_POP_DURATION = 0.5;
export const NUMBERS_AFTER_TILES_DELAY = 0.25;

export type RevealState = {
  hidden: boolean;
  animStart: number;
  tileOrder: number[];
  numberOrder: number[];
  tileJitter: number[];   // small random rotation per tile (radians)
  numberJitter: number[]; // ditto for number tokens
};
export const reveal: RevealState = {
  hidden: true,
  animStart: 0,
  tileOrder: [],
  numberOrder: [],
  tileJitter: [],
  numberJitter: [],
};

export function rebuildRevealOrders(board: Board) {
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
export type RevealMode = "default" | "all-visible" | "fog";
let revealMode: RevealMode = "default";

export function getRevealMode(): RevealMode {
  return revealMode;
}

export function setRevealMode(v: RevealMode) {
  revealMode = v;
}

// Per-tile flip start times (perf.now ms). Populated in fog / all-visible
// modes; ignored in default mode (which uses reveal.tileOrder staggering).
export const tileRevealAt = new Map<number, number>();

export function revealProgress(now: number, totalTiles: number) {
  const elapsed = (now - reveal.animStart) / 1000;
  const allTilesDoneAt = (totalTiles - 1) * TILE_REVEAL_STAGGER + TILE_FLIP_DURATION;
  const numbersStartAt = (totalTiles - 1) * TILE_REVEAL_STAGGER + NUMBERS_AFTER_TILES_DELAY;
  return { elapsed, allTilesDoneAt, numbersStartAt };
}

// Returns t (-Inf, 0, ..., 1, >1): <0 not started, 0-1 mid-flip, >1 finished.
export function tileRevealProgress(i: number, now: number, totalTiles: number): number {
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

export function numberRevealProgress(i: number, now: number, totalTiles: number): number {
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

export function revealAnimationRunning(now: number, totalTiles: number) {
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

// Building reveal scale: when the board flips from face-down to face-up,
// buildings shrink to 0 during the flip then pop back to 1 with easeOutBack
// after the numbers finish appearing.
export const BUILD_REVEAL_SHRINK_DUR = 0.3;
export const BUILD_REVEAL_GROW_DUR = 0.5;
export const BUILD_REVEAL_GROW_DELAY = 0.15;

export function buildingScaleAt(now: number, totalTiles: number): number {
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

export function buildingScaleAnimationRunning(now: number, totalTiles: number) {
  if (reveal.hidden || totalTiles === 0) return false;
  const elapsed = (now - reveal.animStart) / 1000;
  const { numbersStartAt } = revealProgress(now, totalTiles);
  const numbersEnd = numbersStartAt + (totalTiles - 1) * NUMBER_REVEAL_STAGGER + NUMBER_POP_DURATION;
  const growStart = numbersEnd + BUILD_REVEAL_GROW_DELAY;
  return elapsed >= 0 && elapsed < growStart + BUILD_REVEAL_GROW_DUR + 0.05;
}

// Add reveal entries for any newly-explored tile in fog mode. Idempotent.
// The opening (S→B→S→B) stays fully face-down even in fog mode — the per-tile
// scouting only kicks in once the player is in free-play.
export function refreshFogReveals(board: Board, layout: HexLayout) {
  if (revealMode !== "fog" || getPlacementStep() !== "free") return;
  const t = performance.now();
  const explored = exploredTileIndices(board, layout);
  for (const i of explored) {
    if (!tileRevealAt.has(i)) tileRevealAt.set(i, t);
  }
}

// Reset reveal bookkeeping for the requested mode. Call on mode change and on
// game restart.
export function applyRevealModeReset(board: Board, layout: HexLayout) {
  tileRevealAt.clear();
  if (revealMode === "default") {
    reveal.hidden = true;
    return;
  }
  reveal.hidden = false;
  const t = performance.now();
  if (revealMode === "all-visible") {
    for (let i = 0; i < board.tiles.length; i++) tileRevealAt.set(i, t);
  } else if (revealMode === "fog" && getPlacementStep() === "free") {
    // Mid-game flip: seed entries for everything currently explored. During
    // the opening we leave the map face-down on purpose.
    for (const i of exploredTileIndices(board, layout)) tileRevealAt.set(i, t);
  }
}
