// Achievement cards: Largest Army and Longest Road. Both are recomputed from
// the authoritative game state (played-knight counts in dev-cards.ts; the
// bridges map for roads) and stamped onto the Player flags that victory.ts and
// the player strip read. Recompute after any knight play or road placement.

import { Board } from "../board";
import { HexLayout } from "../hex";
import { getPlayers, Player } from "./players";
import { playedKnights } from "./dev-cards";
import { bridges } from "./buildings";
import { buildPlacementGraph, PlacementGraph } from "./placement";

export const LARGEST_ARMY_MIN = 3;
export const LONGEST_ROAD_MIN = 5;

// Award Largest Army to the unique player with the most played knights, as long
// as they have at least 3 and there's no tie for the lead. Standard Catan keeps
// the title with the current holder on a tie, but since we recompute from
// scratch each time we award only on a strict, unambiguous lead (>= min, and
// strictly greater than everyone else).
export function recomputeLargestArmy(players: Player[] = getPlayers()) {
  let leader = -1;
  let best = 0;
  let tie = false;
  for (const p of players) {
    const k = playedKnights(p.id);
    if (k > best) { best = k; leader = p.id; tie = false; }
    else if (k === best && best > 0) { tie = true; }
  }
  const award = !tie && best >= LARGEST_ARMY_MIN ? leader : -1;
  for (const p of players) p.hasLargestArmy = p.id === award;
}

// Longest contiguous road for one player: a DFS over their bridge segments,
// treating each bridge as an edge between its two endpoint vertices and finding
// the longest trail (no edge reused). An opponent's settlement/city sitting on
// a vertex breaks a road there — but for this pass we count pure road
// connectivity; building-break refinement is a TODO.
function longestRoadFor(playerId: number, graph: PlacementGraph): number {
  // Build the player's road adjacency: vertexKey -> list of { to, edgeKey }.
  const adj = new Map<string, { to: string; ek: string }[]>();
  const link = (from: string, to: string, ek: string) => {
    let list = adj.get(from);
    if (!list) { list = []; adj.set(from, list); }
    list.push({ to, ek });
  };
  for (const [ek, rec] of bridges) {
    if (rec.ownerId !== playerId) continue;
    const e = graph.edges.get(ek);
    if (!e) continue;
    link(e.ak, e.bk, ek);
    link(e.bk, e.ak, ek);
  }
  let best = 0;
  const used = new Set<string>();
  const dfs = (v: string, len: number) => {
    if (len > best) best = len;
    for (const { to, ek } of adj.get(v) ?? []) {
      if (used.has(ek)) continue;
      used.add(ek);
      dfs(to, len + 1);
      used.delete(ek);
    }
  };
  for (const start of adj.keys()) dfs(start, 0);
  return best;
}

export function recomputeLongestRoad(
  board: Board,
  layout: HexLayout,
  players: Player[] = getPlayers(),
) {
  const graph = buildPlacementGraph(board, layout);
  let leader = -1;
  let best = 0;
  let tie = false;
  for (const p of players) {
    const len = longestRoadFor(p.id, graph);
    p.longestRoadLength = len;
    if (len > best) { best = len; leader = p.id; tie = false; }
    else if (len === best && best > 0) { tie = true; }
  }
  const award = !tie && best >= LONGEST_ROAD_MIN ? leader : -1;
  for (const p of players) p.hasLongestRoad = p.id === award;
}
