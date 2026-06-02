// Per-player state. Multiplayer scaffolding is local-hot-seat only; the data
// model is shaped so a network layer can be a thin shim over these mutations.
export type Player = {
  id: number;                    // 0..3
  name: string;
  color: string;                 // hex
  // Placeholders — features deferred to later passes:
  victoryPoints: number;
  knightsPlayed: number;
  longestRoadLength: number;
  hasLargestArmy: boolean;
  hasLongestRoad: boolean;
};

export const DEFAULT_COLORS = ["#d23030", "#3a78d2", "#9333ea", "#42a847"];
export const DEFAULT_NAMES = ["Red", "Blue", "Purple", "Green"];
export const MAX_PLAYERS = 4;

let players: Player[] = [];
let activePlayerId: number = 0;
// Viewer is the perspective the HUD renders from — usually equals active, but
// debuggable independently so we can peek at other hands during dev.
let viewerPlayerId: number = 0;

export function initPlayers(count: number, colors?: string[], names?: string[]) {
  const n = Math.max(2, Math.min(MAX_PLAYERS, count));
  players = [];
  for (let i = 0; i < n; i++) {
    players.push({
      id: i,
      name: (names && names[i]) || DEFAULT_NAMES[i],
      color: (colors && colors[i]) || DEFAULT_COLORS[i],
      victoryPoints: 0,
      knightsPlayed: 0,
      longestRoadLength: 0,
      hasLargestArmy: false,
      hasLongestRoad: false,
    });
  }
  if (activePlayerId >= n) activePlayerId = 0;
  if (viewerPlayerId >= n) viewerPlayerId = 0;
}

export function getPlayers(): Player[] {
  return players;
}

export function getPlayerCount(): number {
  return players.length;
}

export function getPlayer(id: number): Player | undefined {
  return players[id];
}

export function getActivePlayerId(): number {
  return activePlayerId;
}

export function setActivePlayerId(id: number) {
  activePlayerId = id;
}

export function getViewerPlayerId(): number {
  return viewerPlayerId;
}

export function setViewerPlayerId(id: number) {
  viewerPlayerId = id;
}

export function getActivePlayer(): Player | undefined {
  return players[activePlayerId];
}

export function getViewerPlayer(): Player | undefined {
  return players[viewerPlayerId];
}

export function getPlayerColor(id: number): string {
  return players[id]?.color ?? DEFAULT_COLORS[id] ?? "#888888";
}
