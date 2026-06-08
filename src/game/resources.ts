import { Board, PortType, TileType } from "../board";
import { axialToPixel, HexLayout } from "../hex";
import { hexCorner } from "../render/primitives";
import {
  iconBrickUrl,
  iconWoodUrl,
  iconStoneUrl,
  iconSheepUrl,
  iconWheatUrl,
  iconVictoryPointUrl,
} from "../assets/loaders";
import { buildings, vertexKey } from "./buildings";
import { dice, POST_DICE_START } from "../animation/dice";
import { tileSheen } from "../animation/tile-sheen";
import { getViewerPlayerId, getActivePlayerId, getPlayers, MAX_PLAYERS } from "./players";
import { getThievesTileIdx } from "./thieves";
import { getVictoryPoints } from "./victory";

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

  // Victory-point badge: an icon + the viewer's current VP total. Sits at the
  // end of the HUD, visually separated like the card total.
  const vp = document.createElement("div");
  vp.className = "vp";
  vp.title = "Victory points";
  const vpImg = document.createElement("img");
  vpImg.src = iconVictoryPointUrl;
  vpImg.alt = "Victory points";
  vpImg.draggable = false;
  const vpNum = document.createElement("span");
  vpNum.className = "num";
  vpNum.id = "victory-total";
  vpNum.textContent = "0";
  vp.appendChild(vpImg);
  vp.appendChild(vpNum);
  root.appendChild(vp);
}

// Refresh the HUD victory-point badge for the given player (defaults to the
// viewer). Cheap DOM text update; safe to call on any board/building change.
export function renderVictoryHud(playerId: number = getViewerPlayerId()) {
  const el = document.getElementById("victory-total");
  if (!el) return;
  const next = getVictoryPoints(playerId);
  const prev = Number(el.textContent ?? "0");
  el.textContent = String(next);
  // Pop the badge when VP goes up (e.g. a settlement/city just landed).
  if (next > prev) {
    const badge = el.closest<HTMLElement>(".vp");
    if (badge) {
      badge.classList.remove("bump");
      void badge.offsetWidth; // reflow so the keyframe re-triggers
      badge.classList.add("bump");
    }
  }
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
  // VP badge shares the HUD's perspective, so keep it on the same player.
  renderVictoryHud(playerId);
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

// Development card cost (1 sheep + 1 wheat + 1 stone).
export const DEV_CARD_COST: Partial<Record<ResourceKind, number>> = { sheep: 1, wheat: 1, stone: 1 };

// Generic cost helpers (used for dev cards; build costs go through the typed
// wrappers above). canAffordCost answers "does the hand cover this cost".
export function canAffordCost(cost: Partial<Record<ResourceKind, number>>, playerId: number = getActivePlayerId()): boolean {
  const hand = resourceCounts[playerId];
  if (!hand) return false;
  for (const r of RESOURCE_ORDER) {
    if ((cost[r] ?? 0) > hand[r]) return false;
  }
  return true;
}

export function spendCost(cost: Partial<Record<ResourceKind, number>>, playerId: number = getActivePlayerId()) {
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

// Loss counterpart to bumpResourceCell: a quick recoil + shake the viewer
// reads as "a card was yanked out of this pile". Only animates the on-screen
// (viewer) hand, same as the gain bump.
export function bumpResourceCellLoss(resource: ResourceKind, playerId: number = getViewerPlayerId()) {
  if (playerId !== getViewerPlayerId()) return;
  const root = document.getElementById("resource-hud");
  if (!root) return;
  const cell = root.querySelector<HTMLElement>(`.res[data-res="${resource}"]`);
  if (!cell) return;
  cell.classList.remove("bump-loss");
  void cell.offsetWidth; // reflow so the keyframe re-triggers
  cell.classList.add("bump-loss");
}

// Robber steal: arc one resource card from the victim's hand toward the
// robber's, decrementing the victim and crediting the robber at the moment the
// card "lands". Reuses the playful toss arc from spawnResourceFly. The flying
// card only renders when at least one end of the trip belongs to the viewer
// (the only hand whose HUD is on screen); for purely off-screen steals we just
// settle the counts silently so player-strip tallies stay correct.
export function spawnResourceSteal(
  resource: ResourceKind,
  victimId: number,
  robberId: number,
) {
  const vHand = resourceCounts[victimId];
  const rHand = resourceCounts[robberId];
  if (!vHand || !rHand) return;

  const settle = () => {
    vHand[resource] = Math.max(0, (vHand[resource] ?? 0) - 1);
    rHand[resource] = (rHand[resource] ?? 0) + 1;
  };

  const viewer = getViewerPlayerId();
  const viewerInvolved = victimId === viewer || robberId === viewer;
  const root = document.getElementById("resource-fx");
  if (!viewerInvolved || !root) {
    // Nothing flies on this client — debit immediately and notify tallies.
    settle();
    if (victimId === viewer || robberId === viewer) renderResourceHud(viewer);
    else onResourcesChanged();
    return;
  }

  // Endpoints. The viewer-owned end anchors on their real resource HUD cell at
  // the bottom; the other end anchors on the *other* player's chip in the top
  // strip, so the card visibly travels between this hand and that avatar.
  // viewer = victim → card leaves the HUD cell, rises to the robber's chip.
  // viewer = robber → card drops from the victim's chip into the HUD cell.
  const cell = resourceCellCenter(resource);
  const viewerIsVictim = victimId === viewer;
  const chip = playerChipCenter(viewerIsVictim ? robberId : victimId);
  const fromX = viewerIsVictim ? cell.x : chip.x;
  const fromY = viewerIsVictim ? cell.y : chip.y;
  const toX = viewerIsVictim ? chip.x : cell.x;
  const toY = viewerIsVictim ? chip.y : cell.y;

  // The victim's pile must drop the instant the card lifts off, so the count
  // and the flying card don't both show the resource at once.
  if (viewerIsVictim) {
    vHand[resource] = Math.max(0, (vHand[resource] ?? 0) - 1);
    renderResourceHud(viewer);
    bumpResourceCellLoss(resource, viewer);
  }

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
  const apexLift = Math.min(160, Math.max(70, Math.hypot(dx, dy) * 0.2));

  const anim = img.animate(
    [
      { transform: "translate(-50%, -50%) scale(0.4)", opacity: 0, offset: 0 },
      {
        transform: "translate(-50%, -50%) scale(1.3)",
        opacity: 1,
        offset: 0.16,
        easing: "cubic-bezier(.34, 1.56, .64, 1)",
      },
      {
        transform: `translate(calc(-50% + ${dx * 0.5}px), calc(-50% + ${dy * 0.5 - apexLift}px)) scale(1.1)`,
        opacity: 1,
        offset: 0.62,
        easing: "cubic-bezier(.45, 0, .55, 1)",
      },
      {
        transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${viewerIsVictim ? 0.4 : 0.85})`,
        opacity: viewerIsVictim ? 0 : 0.9,
        offset: 1,
      },
    ],
    { duration: 820, easing: "linear", fill: "forwards" },
  );
  anim.onfinish = () => {
    img.remove();
    if (!viewerIsVictim) {
      // Viewer is the robber (victim is off-screen): debit the victim now that
      // the card has landed, credit the robber, and pop their cell.
      vHand[resource] = Math.max(0, (vHand[resource] ?? 0) - 1);
      rHand[resource] = (rHand[resource] ?? 0) + 1;
      renderResourceHud(viewer);
      bumpResourceCell(resource, viewer);
    } else {
      // Viewer is the victim: their debit fired on lift-off; on arrival only the
      // (off-screen) robber's credit remains.
      rHand[resource] = (rHand[resource] ?? 0) + 1;
      onResourcesChanged();
    }
  };
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

// Screen center of a player's chip in the top strip, so the steal animation can
// fly a card to/from the right avatar instead of an anonymous screen edge.
// Falls back to the top-center of the screen if the chip isn't mounted.
export function playerChipCenter(playerId: number) {
  const chip = document.querySelector<HTMLElement>(`#player-strip .pchip[data-player-id="${playerId}"]`);
  if (!chip) return { x: window.innerWidth / 2, y: 56 };
  const r = chip.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

export const YIELD_STAGGER_MS = 100;
// Yields kick off only after the dice have fully faded — POST_DICE_START is
// the dice's full lifecycle + a small buffer, expressed in seconds.
export const YIELD_BASE_DELAY_MS = POST_DICE_START * 1000;

export function scheduleRollYields(board: Board, layout: HexLayout, view: { tx: number; ty: number; zoom: number }, canvas: HTMLCanvasElement) {
  if (!dice.matchOrder.length || !buildings.size) return;
  const elapsed = performance.now() - dice.startT;
  const baseDelay = Math.max(0, YIELD_BASE_DELAY_MS - elapsed);
  let staggerIdx = 0;
  const robberIdx = getThievesTileIdx();
  for (const tileIdx of dice.matchOrder) {
    // The robber locks its tile — no resources are produced this roll for any
    // building on it, regardless of ownership or kind.
    if (tileIdx === robberIdx) continue;
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
