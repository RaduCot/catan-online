import {
  getActivePlayerId,
  setActivePlayerId,
  getPlayerCount,
} from "./players";

export type Phase = "pre-match" | "opening" | "roll" | "main";

let phase: Phase = "pre-match";
let turnOrder: number[] = [];
// Sequential opening: each player places their full S1+B1+S2+B2 before the
// next player starts. Slot indexes turnOrder; advances once per player.
let openingSlot: number = 0;

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
  const order = turnOrder;
  if (!order.length) return;
  const idx = order.indexOf(getActivePlayerId());
  const next = order[(idx + 1) % order.length];
  setActivePlayerId(next);
  phase = "roll";
}

export function markDiceRolled() {
  if (phase === "roll") phase = "main";
}

export function resetTurnState() {
  phase = "pre-match";
  turnOrder = [];
  openingSlot = 0;
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
