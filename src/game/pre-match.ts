// Pre-match "roll for first turn" — best of 3 rounds. Each round every
// player rolls 2d6 once; the strict-highest sum wins that round (ties give
// no one the round). After the minimum 3 rounds, whoever has the most
// round-wins starts. If round-wins remain tied at the top after 3 rounds,
// extra rounds are played one at a time until a unique leader emerges.
let rolls: number[][] = [];  // rolls[playerId][roundIdx] = sum
let currentPlayerIdx: number = 0;
let currentRound: number = 0;
let playerCount: number = 0;

const MIN_ROUNDS = 3;

export function startPreMatch(count: number) {
  playerCount = count;
  rolls = Array.from({ length: count }, () => []);
  currentPlayerIdx = 0;
  currentRound = 0;
}

export function getCurrentRollerId(): number {
  return currentPlayerIdx;
}

export function getRolls(): number[][] {
  return rolls;
}

export function getCurrentRound(): number {
  return currentRound;
}

export function recordRoll(sum: number) {
  if (currentPlayerIdx >= playerCount) return;
  rolls[currentPlayerIdx].push(sum);
  if (currentPlayerIdx < playerCount - 1) {
    currentPlayerIdx++;
  } else {
    currentPlayerIdx = 0;
    currentRound++;
  }
}

// Returns wins[playerId] = number of rounds that player has strictly won.
// Tied rounds award no one — they count toward the round budget without
// breaking the tie.
export function getRoundWins(): number[] {
  const wins = new Array(playerCount).fill(0);
  const fullRounds = rolls.length ? Math.min(...rolls.map((r) => r.length)) : 0;
  for (let r = 0; r < fullRounds; r++) {
    let top = -Infinity, topId = -1, ties = 0;
    for (let id = 0; id < playerCount; id++) {
      const s = rolls[id][r];
      if (s > top) { top = s; topId = id; ties = 1; }
      else if (s === top) { ties++; }
    }
    if (ties === 1) wins[topId]++;
  }
  return wins;
}

// Per-round "did playerId win that round?" — useful for highlighting in UI.
export function getRoundWinnerMap(): boolean[][] {
  const fullRounds = rolls.length ? Math.min(...rolls.map((r) => r.length)) : 0;
  const out: boolean[][] = Array.from({ length: playerCount }, () => []);
  for (let r = 0; r < fullRounds; r++) {
    let top = -Infinity, topId = -1, ties = 0;
    for (let id = 0; id < playerCount; id++) {
      const s = rolls[id][r];
      if (s > top) { top = s; topId = id; ties = 1; }
      else if (s === top) { ties++; }
    }
    for (let id = 0; id < playerCount; id++) {
      out[id].push(ties === 1 && id === topId);
    }
  }
  return out;
}

// Complete when either:
//  - a single player has reached WINS_TO_CLINCH wins (early stop — they can't
//    be caught in the remaining rounds), OR
//  - at least MIN_ROUNDS have been fully rolled AND exactly one player tops
//    the leaderboard (post-tiebreak completion path).
// Otherwise more rounds are needed.
export function isComplete(): boolean {
  const wins = getRoundWins();
  const max = wins.length ? Math.max(...wins) : 0;
  // Best-of-3 majority = 2 wins. If one player has reached it and no one is
  // tied with them, we're done — there's no point playing out the final round.
  const WINS_TO_CLINCH = Math.ceil((MIN_ROUNDS + 1) / 2);
  if (max >= WINS_TO_CLINCH && wins.filter((w) => w === max).length === 1) return true;
  const fullRounds = rolls.length ? Math.min(...rolls.map((r) => r.length)) : 0;
  if (fullRounds < MIN_ROUNDS) return false;
  return wins.filter((w) => w === max).length === 1;
}

// Ordered ids: winner first, others by round-wins desc with id ASC as the
// deterministic stable tiebreaker. Only the winner matters for first turn —
// the rest just need a well-defined turn order.
export function resolveTurnOrder(): number[] {
  const wins = getRoundWins();
  const ids = Array.from({ length: playerCount }, (_, i) => i);
  ids.sort((a, b) => wins[b] - wins[a] || a - b);
  return ids;
}
