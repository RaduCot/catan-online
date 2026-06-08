// Development cards: the draw pile + per-player hands. Single source of truth,
// mirroring the resources.ts module-state pattern. VP is computed from these on
// demand (victory.ts) and largest army reads played-knight counts from here.

import { MAX_PLAYERS } from "./players";

export type DevCardType =
  | "knight"
  | "victoryPoint"
  | "roadBuilding"
  | "yearOfPlenty"
  | "monopoly";

// Standard Catan deck — 25 cards. These counts are the canonical draw odds.
export const DECK_COMPOSITION: Record<DevCardType, number> = {
  knight: 14,
  victoryPoint: 5,
  roadBuilding: 2,
  yearOfPlenty: 2,
  monopoly: 2,
};

// Human-readable title + rule text shown on the card body and detail modal.
export const DEV_CARD_INFO: Record<DevCardType, { title: string; rule: string }> = {
  knight: {
    title: "Knight",
    rule: "Move the robber to any tile, then steal 1 random resource from a player with an adjacent settlement or city. Counts toward Largest Army.",
  },
  victoryPoint: {
    title: "Victory Point",
    rule: "Worth 1 victory point. Counts immediately and is kept hidden from opponents until the game is won.",
  },
  roadBuilding: {
    title: "Road Building",
    rule: "Place 2 roads anywhere on the board as if you had just built them — for free.",
  },
  yearOfPlenty: {
    title: "Year of Plenty",
    rule: "Take any 2 resources of your choice from the bank into your hand.",
  },
  monopoly: {
    title: "Monopoly",
    rule: "Name 1 resource. Every other player must give you all of their cards of that resource.",
  },
};

export type DevCardInstance = {
  type: DevCardType;
  // Turn number (turn.ts counter) on which the card was bought — used by the
  // ready rule: a card is playable only on a strictly later turn than this.
  boughtTurn: number;
  // Variety art index for knights (0..n-1 into the knight art array).
  knightArtIdx: number;
  // Set when the card has been played (or, for VP, never — VP just counts).
  played: boolean;
};

let drawPile: DevCardType[] = [];
// Per-player owned cards, pre-sized to MAX_PLAYERS so id indexing is always safe.
let playerCards: DevCardInstance[][] = Array.from({ length: MAX_PLAYERS }, () => []);
// One non-VP development card may be played per turn. Reset on end-turn.
let playedNonVpThisTurn = false;

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// (Re)build a fresh shuffled draw pile and clear every hand. Call on game start
// and on restart.
export function resetDevCards() {
  drawPile = [];
  for (const type of Object.keys(DECK_COMPOSITION) as DevCardType[]) {
    for (let i = 0; i < DECK_COMPOSITION[type]; i++) drawPile.push(type);
  }
  shuffleInPlace(drawPile);
  playerCards = Array.from({ length: MAX_PLAYERS }, () => []);
  playedNonVpThisTurn = false;
}

export function deckRemaining(): number {
  return drawPile.length;
}

const KNIGHT_ART_COUNT = 5;

// Draw the top card of the pile into a player's hand. Returns the new instance,
// or null if the pile is empty.
export function drawDevCard(playerId: number, currentTurn: number): DevCardInstance | null {
  const type = drawPile.pop();
  if (!type) return null;
  const inst: DevCardInstance = {
    type,
    boughtTurn: currentTurn,
    knightArtIdx: type === "knight" ? Math.floor(Math.random() * KNIGHT_ART_COUNT) : 0,
    played: false,
  };
  (playerCards[playerId] ??= []).push(inst);
  return inst;
}

// Debug: add a specific card type to a player's hand without drawing from the
// pile (so it doesn't affect deck odds). Used by the dev menu's grant control.
export function grantDevCard(playerId: number, type: DevCardType, currentTurn: number): DevCardInstance {
  const inst: DevCardInstance = {
    type,
    boughtTurn: currentTurn,
    knightArtIdx: type === "knight" ? Math.floor(Math.random() * KNIGHT_ART_COUNT) : 0,
    played: false,
  };
  (playerCards[playerId] ??= []).push(inst);
  return inst;
}

export function getPlayerCards(playerId: number): DevCardInstance[] {
  return playerCards[playerId] ?? [];
}

// Total dev cards held — the number opponents are allowed to see (req #6).
export function devCardCount(playerId: number): number {
  return (playerCards[playerId] ?? []).length;
}

// Knights this player has PLAYED — public, drives Largest Army + VP display.
export function playedKnights(playerId: number): number {
  return (playerCards[playerId] ?? []).filter((c) => c.type === "knight" && c.played).length;
}

// VP dev cards held — each is worth 1 VP immediately (counted whether or not
// they've been "played", since VP cards are never actively played).
export function victoryPointCards(playerId: number): number {
  return (playerCards[playerId] ?? []).filter((c) => c.type === "victoryPoint").length;
}

// Whether the given card can be played right now. VP cards are never playable
// (they just count). All others require: main phase, bought on an earlier turn,
// not yet played, and — for the one-per-turn limit — no other non-VP card
// played this turn.
//
// Note: standard Catan lets a knight be played before rolling, but our robber
// sequence ends by returning to "main"; allowing it in "roll" would skip the
// dice. We therefore gate all plays to "main" to keep the turn flow correct.
export function canPlayDevCard(
  inst: DevCardInstance,
  currentTurn: number,
  phase: string,
): boolean {
  if (inst.type === "victoryPoint") return false;
  if (inst.played) return false;
  if (inst.boughtTurn >= currentTurn) return false; // not ready until a later turn
  if (playedNonVpThisTurn) return false;
  return phase === "main";
}

// True when the card is bought-this-turn (shown as "not ready").
export function isReady(inst: DevCardInstance, currentTurn: number): boolean {
  return inst.boughtTurn < currentTurn;
}

export function markPlayed(inst: DevCardInstance) {
  inst.played = true;
  if (inst.type !== "victoryPoint") playedNonVpThisTurn = true;
}

export function resetDevCardTurnFlag() {
  playedNonVpThisTurn = false;
}
