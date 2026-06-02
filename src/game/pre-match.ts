// Pre-match "roll for first turn" — each player rolls 2d6 three times; highest
// sum wins. Ties at the top trigger a tiebreak round among only the tied ids.
let rolls: number[][] = [];
let currentPlayerIdx: number = 0;
let rollsRemaining: number = 3;
let playerCount: number = 0;
// Restricted set of ids to walk through (used by tiebreak so untied players
// are skipped). Null means "all players in id order".
let activeIds: number[] | null = null;

export function startPreMatch(count: number) {
  playerCount = count;
  rolls = Array.from({ length: count }, () => []);
  currentPlayerIdx = 0;
  rollsRemaining = 3;
  activeIds = null;
}

function currentId(): number {
  if (activeIds) return activeIds[currentPlayerIdx];
  return currentPlayerIdx;
}

export function getCurrentRollerId(): number {
  return currentId();
}

export function getRolls(): number[][] {
  return rolls;
}

export function getRollsRemaining(): number {
  return rollsRemaining;
}

export function recordRoll(sum: number) {
  const id = currentId();
  if (rolls[id].length >= 3) return;
  rolls[id].push(sum);
  rollsRemaining = 3 - rolls[id].length;
  if (rollsRemaining === 0) {
    const total = activeIds ? activeIds.length : playerCount;
    if (currentPlayerIdx < total - 1) {
      currentPlayerIdx++;
      rollsRemaining = 3;
    }
  }
}

export function isComplete(): boolean {
  const ids = activeIds ?? Array.from({ length: playerCount }, (_, i) => i);
  return ids.every((id) => rolls[id].length === 3);
}

function sumOf(id: number): number {
  return rolls[id].reduce((a, b) => a + b, 0);
}

export function getSums(): { id: number; sum: number }[] {
  return Array.from({ length: playerCount }, (_, i) => ({ id: i, sum: sumOf(i) }));
}

// Returns ids sorted descending by sum, or null if the top players are tied.
export function resolveTurnOrder(): number[] | null {
  const sums = getSums().sort((a, b) => b.sum - a.sum);
  const top = sums[0].sum;
  const tiedAtTop = sums.filter((s) => s.sum === top);
  if (tiedAtTop.length > 1) return null;
  return sums.map((s) => s.id);
}

export function tiedTopIds(): number[] {
  const sums = getSums().sort((a, b) => b.sum - a.sum);
  const top = sums[0].sum;
  return sums.filter((s) => s.sum === top).map((s) => s.id);
}

export function startTiebreak(tied: number[]) {
  for (const id of tied) rolls[id] = [];
  activeIds = tied.slice();
  currentPlayerIdx = 0;
  rollsRemaining = 3;
}
