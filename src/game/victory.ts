// Victory points. Computed on demand from the authoritative game state (the
// buildings map, and later the longest-road / largest-army / dev-card systems)
// rather than stored, so a count can never drift from what's actually on the
// board. Each contributing system gets its own helper here; getVictoryPoints
// sums them so callers have a single source of truth.

import { buildings } from "./buildings";
import { getPlayer } from "./players";
import { victoryPointCards } from "./dev-cards";

// Standard Catan VP weights.
export const VP_SETTLEMENT = 1;
export const VP_CITY = 2;
export const VP_LARGEST_ARMY = 2;
export const VP_LONGEST_ROAD = 2;
export const VP_DEV_CARD = 1;

// VP from placed pieces: 1 per settlement, 2 per city.
export function buildingVictoryPoints(playerId: number): number {
  let vp = 0;
  for (const rec of buildings.values()) {
    if (rec.ownerId !== playerId) continue;
    vp += rec.kind === "city" ? VP_CITY : VP_SETTLEMENT;
  }
  return vp;
}

// Total victory points for a player: buildings (1/settlement, 2/city), the two
// achievement cards (+2 each), and held victory-point dev cards (+1 each, which
// count immediately on purchase). Computed on demand so it can't drift.
export function getVictoryPoints(playerId: number): number {
  const p = getPlayer(playerId);
  let vp = buildingVictoryPoints(playerId);
  if (p?.hasLargestArmy) vp += VP_LARGEST_ARMY;
  if (p?.hasLongestRoad) vp += VP_LONGEST_ROAD;
  vp += victoryPointCards(playerId) * VP_DEV_CARD;
  return vp;
}
