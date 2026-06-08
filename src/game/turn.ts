import {
  getActivePlayerId,
  setActivePlayerId,
  getPlayerCount,
} from "./players";

export type Phase =
  | "pre-match"
  | "opening"
  | "roll"
  | "main"
  | "discard"
  | "robber-move"
  | "robber-steal";

let phase: Phase = "pre-match";
let turnOrder: number[] = [];
// Sequential opening: each player places their full S1+B1+S2+B2 before the
// next player starts. Slot indexes turnOrder; advances once per player.
let openingSlot: number = 0;

// Discard queue for a 7-roll: players (in turn order) who hold > 7 cards owe
// floor(total/2). The head of the queue is currently discarding; remaining
// drops as discardOne() fires. When the head reaches 0 it pops; when the
// queue empties we transition to "robber-move".
type DiscardEntry = { playerId: number; remaining: number };
let discardQueue: DiscardEntry[] = [];

export function getPhase(): Phase { return phase; }
export function setPhase(p: Phase) { phase = p; }
export function getTurnOrder(): number[] { return turnOrder; }
export function setTurnOrder(order: number[]) { turnOrder = order.slice(); }
export function getOpeningSlot(): number { return openingSlot; }

export function openingActivePlayerId(): number {
  if (turnOrder.length === 0) return 0;
  return turnOrder[openingSlot] ?? turnOrder[0];
}

// Call once when a player completes their full opening (S1+B1+S2+B2).
// Advances the slot; transitions phase → "roll" when every player has opened.
export function openingAdvance() {
  openingSlot++;
  if (openingSlot >= turnOrder.length) {
    phase = "roll";
    setActivePlayerId(turnOrder[0]);
  }
}

export function endTurn() {
  // Defensive: refuse to advance the turn from any state other than "main".
  // The robber sequence (discard → robber-move → robber-steal) must complete
  // before the player can hand off, even if some UI path leaks the button.
  if (phase !== "main") return;
  const order = turnOrder;
  if (!order.length) return;
  const idx = order.indexOf(getActivePlayerId());
  const next = order[(idx + 1) % order.length];
  setActivePlayerId(next);
  phase = "roll";
}

export function markDiceRolled() {
  // Sevens are owned by the roll handler (it drives discard → robber-move).
  // Only auto-advance the normal yields path.
  if (phase === "roll") phase = "main";
}

export function resetTurnState() {
  phase = "pre-match";
  turnOrder = [];
  openingSlot = 0;
  discardQueue = [];
}

// Whoever is the current "builder" for placement purposes — opening's snake
// pointer in opening phase, else the active player.
export function currentBuilderId(): number {
  if (phase === "opening") return openingActivePlayerId();
  return getActivePlayerId();
}

// Convenience for callers that just need the count without importing players.
export function turnPlayerCount(): number {
  return getPlayerCount();
}

// ---------- Robber sub-phases ----------

export function startDiscardPhase(playerIds: number[], amountsByPlayer: Map<number, number>) {
  discardQueue = [];
  for (const pid of playerIds) {
    const owed = amountsByPlayer.get(pid) ?? 0;
    if (owed > 0) discardQueue.push({ playerId: pid, remaining: owed });
  }
  phase = discardQueue.length > 0 ? "discard" : "robber-move";
}

export function getDiscardCurrent(): { playerId: number; remaining: number } | null {
  if (!discardQueue.length) return null;
  const head = discardQueue[0];
  return { playerId: head.playerId, remaining: head.remaining };
}

// Decrement the head's owed count. When it reaches 0 we pop and either
// advance to the next discarder or transition to "robber-move".
export function discardOne() {
  if (!discardQueue.length) return;
  const head = discardQueue[0];
  head.remaining = Math.max(0, head.remaining - 1);
  if (head.remaining === 0) discardQueue.shift();
  if (discardQueue.length === 0 && phase === "discard") {
    phase = "robber-move";
  }
}

export function startRobberMovePhase() {
  phase = "robber-move";
}

export function startRobberStealPhase() {
  phase = "robber-steal";
}

export function finishRobber() {
  phase = "main";
}
