import { Board, PortType, TileType } from "../board";
import { axialToPixel, HexLayout } from "../hex";
import { hexCorner } from "../render/primitives";
import {
  iconBrickUrl,
  iconWoodUrl,
  iconStoneUrl,
  iconSheepUrl,
  iconWheatUrl,
} from "../assets/loaders";
import { buildings, vertexKey } from "./buildings";
import { dice, DICE_ROLL_DURATION, DICE_SETTLE_DURATION } from "../animation/dice";
import { tileSheen } from "../animation/tile-sheen";
import { getViewerPlayerId, getActivePlayerId, getPlayers, MAX_PLAYERS } from "./players";

// Resources kept as a flat record keyed by canonical resource name. The
// multiplayer layer should call setResources(...) with authoritative counts
// whenever the player's hand changes.
export type ResourceKind = "wood" | "brick" | "sheep" | "wheat" | "stone";
export const RESOURCE_ORDER: ResourceKind[] = ["wood", "brick", "sheep", "wheat", "stone"];
export const RESOURCE_ICONS: Record<ResourceKind, string> = {
  wood: iconWoodUrl,
  brick: iconBrickUrl,
  sheep: iconSheepUrl,
  wheat: iconWheatUrl,
  stone: iconStoneUrl,
};
export const RESOURCE_LABELS: Record<ResourceKind, string> = {
  wood: "Wood",
  brick: "Brick",
  sheep: "Sheep",
  wheat: "Wheat",
  stone: "Stone",
};

const emptyPile = (): Record<ResourceKind, number> => ({ wood: 0, brick: 0, sheep: 0, wheat: 0, stone: 0 });
// Per-player hand. Pre-sized to MAX_PLAYERS so callers indexing by id never
// trip a sparse-array read; the active slot count comes from getPlayers().
export const resourceCounts: Record<ResourceKind, number>[] = Array.from({ length: MAX_PLAYERS }, () => emptyPile());

export function resetAllResources() {
  for (let i = 0; i < resourceCounts.length; i++) resourceCounts[i] = emptyPile();
}

// Module-scope callbacks set by main() so cross-cutting concerns (trade panel
// rate badges, passives badges) can react to resource / placement changes
// without threading wiring through every mutation site.
let onResourcesChanged: () => void = () => {};

export function setOnResourcesChanged(fn: () => void) {
  onResourcesChanged = fn;
}

export function mountResourceHud() {
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

export function renderResourceHud(playerId: number = getViewerPlayerId()) {
  const root = document.getElementById("resource-hud");
  if (!root) return;
  const hand = resourceCounts[playerId] ?? emptyPile();
  let total = 0;
  for (const kind of RESOURCE_ORDER) {
    const cell = root.querySelector<HTMLElement>(`.res[data-res="${kind}"]`);
    if (!cell) continue;
    const n = hand[kind];
    cell.dataset.count = String(n);
    const span = cell.querySelector(".count");
    if (span) span.textContent = String(n);
    total += n;
  }
  const totalEl = document.getElementById("resource-total");
  if (totalEl) totalEl.textContent = String(total);
  onResourcesChanged();
}

export function setResources(playerId: number, next: Partial<Record<ResourceKind, number>>) {
  const hand = resourceCounts[playerId];
  if (!hand) return;
  for (const k of RESOURCE_ORDER) {
    if (next[k] != null) hand[k] = Math.max(0, Math.floor(next[k]!));
  }
  if (playerId === getViewerPlayerId()) renderResourceHud(playerId);
  else onResourcesChanged();
}

export function getResources(playerId: number): Record<ResourceKind, number> {
  return { ...(resourceCounts[playerId] ?? emptyPile()) };
}

// Expose for multiplayer/dev wiring. Replace with real game-state subscription
// once the netcode is in.
(window as unknown as {
  catan?: {
    setResources: (playerId: number, partial: Partial<Record<ResourceKind, number>>) => void;
    getResources: (playerId: number) => Record<ResourceKind, number>;
    getPlayers: () => ReturnType<typeof getPlayers>;
  };
}).catan = {
  setResources,
  getResources,
  getPlayers,
};

// Tile type → producible resource. Desert (no resource) is omitted.
export const TILE_TO_RESOURCE: Partial<Record<TileType, ResourceKind>> = {
  forest: "wood",
  bricks: "brick",
  sheep: "sheep",
  wheat: "wheat",
  mountain: "stone",
};

// Standard Catan building costs.
export const BUILD_COSTS: Record<"settlement" | "city" | "bridge", Partial<Record<ResourceKind, number>>> = {
  settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 },
  bridge:     { wood: 1, brick: 1 },
  city:       { wheat: 2, stone: 3 },
};

export function canAfford(kind: "settlement" | "city" | "bridge", playerId: number = getActivePlayerId()): boolean {
  const cost = BUILD_COSTS[kind];
  const hand = resourceCounts[playerId];
  if (!hand) return false;
  for (const r of RESOURCE_ORDER) {
    if ((cost[r] ?? 0) > hand[r]) return false;
  }
  return true;
}

export function spendForBuild(kind: "settlement" | "city" | "bridge", playerId: number = getActivePlayerId()) {
  const cost = BUILD_COSTS[kind];
  const hand = resourceCounts[playerId];
  if (!hand) return;
  for (const r of RESOURCE_ORDER) {
    const c = cost[r] ?? 0;
    if (c) hand[r] = Math.max(0, hand[r] - c);
  }
  if (playerId === getViewerPlayerId()) renderResourceHud(playerId);
  else onResourcesChanged();
}

// Map ResourceKind → matching 2:1 port type name (board.ts uses TileType
// naming for specific ports).
export const RESOURCE_TO_PORT_TYPE: Record<ResourceKind, PortType> = {
  wood: "forest",
  brick: "bricks",
  sheep: "sheep",
  wheat: "wheat",
  stone: "mountain",
};

export function bumpResourceCell(resource: ResourceKind, playerId: number = getViewerPlayerId()) {
  // Only animate when the bump targets the currently-viewed hand — silent for others.
  if (playerId !== getViewerPlayerId()) return;
  const root = document.getElementById("resource-hud");
  if (!root) return;
  const cell = root.querySelector<HTMLElement>(`.res[data-res="${resource}"]`);
  if (!cell) return;
  cell.classList.remove("bump");
  // Force reflow so the same class re-triggers the keyframe animation.
  void cell.offsetWidth;
  cell.classList.add("bump");
}

export function spawnResourceFly(
  resource: ResourceKind,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  delayMs: number,
  recipientId: number,
) {
  const hand = resourceCounts[recipientId];
  if (!hand) return;
  // Non-viewer credits don't fly to a HUD that isn't on screen — just bump the
  // tally silently so the player-strip badge updates.
  if (recipientId !== getViewerPlayerId()) {
    setTimeout(() => {
      hand[resource] = (hand[resource] ?? 0) + 1;
      onResourcesChanged();
    }, delayMs);
    return;
  }
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
    hand[resource] = (hand[resource] ?? 0) + 1;
    renderResourceHud(recipientId);
    bumpResourceCell(resource, recipientId);
  };
}

export function tileScreenCenter(idx: number, board: Board, layout: HexLayout, view: { tx: number; ty: number; zoom: number }, canvas: HTMLCanvasElement) {
  const { x, y } = axialToPixel(board.tiles[idx], layout);
  const rect = canvas.getBoundingClientRect();
  return {
    x: rect.left + x * view.zoom + view.tx,
    y: rect.top + y * view.zoom + view.ty,
  };
}

export function resourceCellCenter(resource: ResourceKind) {
  const cell = document.querySelector<HTMLElement>(`#resource-hud .res[data-res="${resource}"]`);
  if (!cell) return { x: window.innerWidth / 2, y: window.innerHeight - 40 };
  const r = cell.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

export const YIELD_STAGGER_MS = 100;
export const YIELD_BASE_DELAY_MS = (DICE_ROLL_DURATION + DICE_SETTLE_DURATION) * 1000 + 200;

export function scheduleRollYields(board: Board, layout: HexLayout, view: { tx: number; ty: number; zoom: number }, canvas: HTMLCanvasElement) {
  if (!dice.matchOrder.length || !buildings.size) return;
  const elapsed = performance.now() - dice.startT;
  const baseDelay = Math.max(0, YIELD_BASE_DELAY_MS - elapsed);
  let staggerIdx = 0;
  for (const tileIdx of dice.matchOrder) {
    const tile = board.tiles[tileIdx];
    const resource = TILE_TO_RESOURCE[tile.type];
    if (!resource) continue;
    const { x: tx, y: ty } = axialToPixel(tile, layout);
    // Per-corner yield credited to the building's owner.
    type Yield = { ownerId: number; count: number };
    const tileYields: Yield[] = [];
    for (let i = 0; i < 6; i++) {
      const [cx, cy] = hexCorner(tx, ty, layout.size, i);
      const rec = buildings.get(vertexKey(cx, cy));
      if (!rec) continue;
      tileYields.push({ ownerId: rec.ownerId, count: rec.kind === "city" ? 2 : 1 });
    }
    if (!tileYields.length) continue;
    const from = tileScreenCenter(tileIdx, board, layout, view, canvas);
    const to = resourceCellCenter(resource);
    let firstDelayForTile = -1;
    for (const y of tileYields) {
      for (let k = 0; k < y.count; k++) {
        const delay = baseDelay + staggerIdx * YIELD_STAGGER_MS;
        if (firstDelayForTile < 0) firstDelayForTile = delay;
        spawnResourceFly(resource, from.x, from.y, to.x, to.y, delay, y.ownerId);
        staggerIdx++;
      }
    }
    setTimeout(() => {
      tileSheen.set(tileIdx, performance.now());
    }, firstDelayForTile);
  }
}
