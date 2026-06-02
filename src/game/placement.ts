import { Board } from "../board";
import { axialToPixel, HexLayout } from "../hex";
import { hexCorner } from "../render/primitives";
import {
  buildings,
  bridges,
  vertexKey,
  edgeKey,
  edgeVariant,
  BridgeVariant,
} from "./buildings";
import { canAfford } from "./resources";
import { currentBuilderId } from "./turn";

// --- Placement rules. Catan: settlements/cities at vertices (distance-2
// apart), bridges (roads) at edges, must be connected to a friendly building
// or bridge. Opening phase is a forced sequence: S1, B1 touching S1, S2
// anywhere valid, B2 touching S2. After that → free mode.
export type PlacementStep = "initial-s1" | "initial-b1" | "initial-s2" | "initial-b2" | "free";
let placementStep: PlacementStep = "initial-s1";
// Vertex key of the most recently placed initial settlement — the next bridge
// must touch it.
let lastInitialSettlementKey: string | null = null;

export function getPlacementStep(): PlacementStep {
  return placementStep;
}

export function setPlacementStep(v: PlacementStep) {
  placementStep = v;
}

export function getLastInitialSettlementKey(): string | null {
  return lastInitialSettlementKey;
}

export function setLastInitialSettlementKey(v: string | null) {
  lastInitialSettlementKey = v;
}

export type PlacementEdge = {
  mid: [number, number];
  variant: BridgeVariant;
  a: [number, number];
  b: [number, number];
  ak: string; // endpoint vertex keys
  bk: string;
};
export type PlacementGraph = {
  vertices: Map<string, [number, number]>;
  edges: Map<string, PlacementEdge>;
  vertexEdges: Map<string, Set<string>>;     // vertex key → incident edge keys
  vertexNeighbors: Map<string, Set<string>>; // vertex key → vertex keys 1 edge away
};

export function buildPlacementGraph(board: Board, layout: HexLayout): PlacementGraph {
  const vertices = new Map<string, [number, number]>();
  const edges = new Map<string, PlacementEdge>();
  const vertexEdges = new Map<string, Set<string>>();
  const vertexNeighbors = new Map<string, Set<string>>();
  const s = layout.size;
  const ensure = <K, V>(m: Map<K, Set<V>>, k: K) => {
    let cur = m.get(k);
    if (!cur) { cur = new Set(); m.set(k, cur); }
    return cur;
  };
  for (const t of board.tiles) {
    const { x, y } = axialToPixel(t, layout);
    const corners: [number, number][] = [];
    const keys: string[] = [];
    for (let i = 0; i < 6; i++) {
      const c = hexCorner(x, y, s, i);
      corners.push(c);
      const k = vertexKey(c[0], c[1]);
      keys.push(k);
      vertices.set(k, c);
    }
    for (let i = 0; i < 6; i++) {
      const ak = keys[i];
      const bk = keys[(i + 1) % 6];
      const [ax, ay] = corners[i];
      const [bx, by] = corners[(i + 1) % 6];
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      const ek = edgeKey(mx, my);
      if (!edges.has(ek)) {
        edges.set(ek, { mid: [mx, my], variant: edgeVariant(i), a: [ax, ay], b: [bx, by], ak, bk });
      }
      ensure(vertexEdges, ak).add(ek);
      ensure(vertexEdges, bk).add(ek);
      ensure(vertexNeighbors, ak).add(bk);
      ensure(vertexNeighbors, bk).add(ak);
    }
  }
  return { vertices, edges, vertexEdges, vertexNeighbors };
}

// Distance rule: a vertex is OK for settlement iff it itself is empty AND no
// vertex one edge away holds a settlement/city. Distance applies vs ALL
// players (you can't settle adjacent to any opponent either).
export function settlementDistanceOk(vk: string, graph: PlacementGraph): boolean {
  if (buildings.has(vk)) return false;
  for (const n of graph.vertexNeighbors.get(vk) ?? []) {
    if (buildings.has(n)) return false;
  }
  return true;
}

// Connected by *friendly* (current builder's) bridge.
export function vertexConnectedByBridge(vk: string, graph: PlacementGraph): boolean {
  const me = currentBuilderId();
  for (const e of graph.vertexEdges.get(vk) ?? []) {
    const rec = bridges.get(e);
    if (rec && rec.ownerId === me) return true;
  }
  return false;
}

export function validSettlementVertices(graph: PlacementGraph): Set<string> {
  const out = new Set<string>();
  if (placementStep === "initial-s1" || placementStep === "initial-s2") {
    for (const vk of graph.vertices.keys()) {
      if (settlementDistanceOk(vk, graph)) out.add(vk);
    }
  } else if (placementStep === "free") {
    if (!canAfford("settlement")) return out;
    for (const vk of graph.vertices.keys()) {
      if (!settlementDistanceOk(vk, graph)) continue;
      if (!vertexConnectedByBridge(vk, graph)) continue;
      out.add(vk);
    }
  }
  return out;
}

export function validBridgeEdges(graph: PlacementGraph): Set<string> {
  const out = new Set<string>();
  const me = currentBuilderId();
  if (placementStep === "initial-b1" || placementStep === "initial-b2") {
    if (!lastInitialSettlementKey) return out;
    for (const e of graph.vertexEdges.get(lastInitialSettlementKey) ?? []) {
      if (!bridges.has(e)) out.add(e);
    }
  } else if (placementStep === "free") {
    if (!canAfford("bridge")) return out;
    for (const [ek, eData] of graph.edges) {
      if (bridges.has(ek)) continue;
      let connected = false;
      for (const vk of [eData.ak, eData.bk]) {
        const b = buildings.get(vk);
        if (b && b.ownerId === me) { connected = true; break; }
        for (const other of graph.vertexEdges.get(vk) ?? []) {
          if (other === ek) continue;
          const obr = bridges.get(other);
          if (obr && obr.ownerId === me) { connected = true; break; }
        }
        if (connected) break;
      }
      if (connected) out.add(ek);
    }
  }
  return out;
}

// Snap mouse world position to nearest valid placement target. Vertex/edge,
// whichever is closer within the snap radius.
export function snapPlacementHover(
  graph: PlacementGraph,
  vSet: Set<string>,
  cSet: Set<string>,
  eSet: Set<string>,
  wx: number,
  wy: number,
  size: number,
): { kind: "vertex" | "edge"; key: string } | null {
  if (wx < -1e8 || wy < -1e8) return null;
  let bestKind: "vertex" | "edge" | null = null;
  let bestKey = "";
  let bestD = Infinity;
  const vMax = size * 0.45;
  const eMax = size * 0.3;
  for (const vk of vSet) {
    const v = graph.vertices.get(vk);
    if (!v) continue;
    const d = Math.hypot(v[0] - wx, v[1] - wy);
    if (d < bestD && d < vMax) { bestD = d; bestKind = "vertex"; bestKey = vk; }
  }
  for (const vk of cSet) {
    const v = graph.vertices.get(vk);
    if (!v) continue;
    const d = Math.hypot(v[0] - wx, v[1] - wy);
    if (d < bestD && d < vMax) { bestD = d; bestKind = "vertex"; bestKey = vk; }
  }
  for (const ek of eSet) {
    const e = graph.edges.get(ek);
    if (!e) continue;
    const d = Math.hypot(e.mid[0] - wx, e.mid[1] - wy);
    if (d < bestD && d < eMax) { bestD = d; bestKind = "edge"; bestKey = ek; }
  }
  return bestKind ? { kind: bestKind, key: bestKey } : null;
}

export function validCityVertices(): Set<string> {
  const out = new Set<string>();
  if (placementStep !== "free") return out;
  if (!canAfford("city")) return out;
  const me = currentBuilderId();
  for (const [vk, rec] of buildings) {
    if (rec.kind === "settlement" && rec.ownerId === me) out.add(vk);
  }
  return out;
}

// Vertex is "explored" if any of the player's buildings sit on it OR any of
// their bridges has it as an endpoint. In fog mode, tiles become visible the
// moment any of their 6 corners is explored.
export function exploredVertexKeys(playerId: number): Set<string> {
  const set = new Set<string>();
  for (const [vk, rec] of buildings) {
    if (rec.ownerId === playerId) set.add(vk);
  }
  for (const rec of bridges.values()) {
    if (rec.ownerId !== playerId) continue;
    set.add(vertexKey(rec.a[0], rec.a[1]));
    set.add(vertexKey(rec.b[0], rec.b[1]));
  }
  return set;
}

export function exploredTileIndices(playerId: number, board: Board, layout: HexLayout): Set<number> {
  const out = new Set<number>();
  const explored = exploredVertexKeys(playerId);
  const s = layout.size;
  for (let i = 0; i < board.tiles.length; i++) {
    const { x, y } = axialToPixel(board.tiles[i], layout);
    for (let c = 0; c < 6; c++) {
      const [cx, cy] = hexCorner(x, y, s, c);
      if (explored.has(vertexKey(cx, cy))) { out.add(i); break; }
    }
  }
  return out;
}

// Map of vertex-key → set of tile indices that share that vertex as a corner.
// Used to test "is this vertex touching an explored tile?" without rescanning
// every tile per query.
export function buildVertexAdjacency(board: Board, layout: HexLayout): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>();
  const s = layout.size;
  for (let i = 0; i < board.tiles.length; i++) {
    const { x, y } = axialToPixel(board.tiles[i], layout);
    for (let c = 0; c < 6; c++) {
      const [cx, cy] = hexCorner(x, y, s, c);
      const k = vertexKey(cx, cy);
      let set = out.get(k);
      if (!set) { set = new Set(); out.set(k, set); }
      set.add(i);
    }
  }
  return out;
}

// Pieces (buildings + bridges) the viewer can see under fog-of-war: their own
// pieces, plus opponents' pieces sitting on tiles the viewer has explored.
// A building is visible if any of its 3 corner-tiles is explored. A bridge
// is visible only if one of the two tiles its edge actually sits between is
// explored — checking endpoint vertices would over-reveal, since a vertex is
// shared by up to 3 tiles, including tiles the bridge doesn't touch.
export function visiblePiecesForViewer(
  viewerId: number,
  board: Board,
  layout: HexLayout,
): { buildings: Set<string>; bridges: Set<string> } {
  const exploredTiles = exploredTileIndices(viewerId, board, layout);
  const adj = buildVertexAdjacency(board, layout);
  const anyExplored = (tiles: Set<number> | undefined): boolean => {
    if (!tiles) return false;
    for (const t of tiles) if (exploredTiles.has(t)) return true;
    return false;
  };
  const visBuildings = new Set<string>();
  for (const [vk, rec] of buildings) {
    if (rec.ownerId === viewerId || anyExplored(adj.get(vk))) visBuildings.add(vk);
  }
  const visBridges = new Set<string>();
  for (const [ek, rec] of bridges) {
    if (rec.ownerId === viewerId) { visBridges.add(ek); continue; }
    // Tiles the edge sits between = intersection of its two endpoint
    // vertices' adjacent-tile sets (2 tiles inland, 1 on the coast).
    const aTiles = adj.get(vertexKey(rec.a[0], rec.a[1]));
    const bTiles = adj.get(vertexKey(rec.b[0], rec.b[1]));
    if (!aTiles || !bTiles) continue;
    let seen = false;
    for (const t of aTiles) {
      if (bTiles.has(t) && exploredTiles.has(t)) { seen = true; break; }
    }
    if (seen) visBridges.add(ek);
  }
  return { buildings: visBuildings, bridges: visBridges };
}
