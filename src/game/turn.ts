import {
  getActivePlayerId,
  setActivePlayerId,
  getPlayerCount,
} from "./players";

export type Phase = "pre-match" | "opening" | "roll" | "main";

let phase: Phase = "pre-match";
let turnOrder: number[] = [];
// Snake-order opening: slot 0..N-1 forward, N..2N-1 reverse.
let openingSlot: number = 0;
let openingSubStep: "settlement" | "bridge" = "settlement";

export function getPhase(): Phase { return phase; }
export function setPhase(p: Phase) { phase = p; }
export function getTurnOrder(): number[] { return turnOrder; }
export function setTurnOrder(order: number[]) { turnOrder = order.slice(); }
export function getOpeningSlot(): number { return openingSlot; }
export function getOpeningSubStep(): "settlement" | "bridge" { return openingSubStep; }

export function openingActivePlayerId(): number {
  const N = turnOrder.length;
  if (N === 0) return 0;
  if (openingSlot < N) return turnOrder[openingSlot];
  return turnOrder[2 * N - 1 - openingSlot];
}

export function openingAdvance() {
  const N = turnOrder.length;
  if (openingSubStep === "settlement") {
    openingSubStep = "bridge";
    return;
  }
  // bridge → next slot's settlement
  openingSubStep = "settlement";
  openingSlot++;
  if (openingSlot >= 2 * N) {
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
  openingSubStep = "settlement";
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
