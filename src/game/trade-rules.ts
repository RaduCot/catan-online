import { Board, PortType } from "../board";
import { axialToPixel, HexLayout } from "../hex";
import { hexCorner } from "../render/primitives";
import { buildings, vertexKey } from "./buildings";
import { ResourceKind, RESOURCE_TO_PORT_TYPE } from "./resources";
import { getPlacementStep } from "./placement";
import { getRevealMode } from "../animation/reveal";

// Bank trade rule set. Vanilla Catan only allows N-of-the-same-resource
// trades. The "mixed" variant — any N cards regardless of type — is a
// house-rule preset that will be selectable from the lobby; keep the helpers
// around so we can flip this with one line.
export type BankTradeRule = "standard" | "mixed";
let BANK_TRADE_RULE: BankTradeRule = "standard";

export function getBankTradeRule(): BankTradeRule {
  return BANK_TRADE_RULE;
}

export function setBankTradeRule(v: BankTradeRule) {
  BANK_TRADE_RULE = v;
}

// Custom rule: each opening settlement must sit on a vertex with exactly one
// neighbouring 6 or 8 tile. Only meaningful in fog-of-war mode (in default /
// all-visible the player already sees every chance number).
let ruleGuaranteed68: boolean = false;

export function getRuleGuaranteed68(): boolean {
  return ruleGuaranteed68;
}

export function setRuleGuaranteed68(v: boolean) {
  ruleGuaranteed68 = v;
}

export function countNeighbor68(vk: string, board: Board, layout: HexLayout): number {
  const s = layout.size;
  let count = 0;
  for (let i = 0; i < board.tiles.length; i++) {
    const n = board.tiles[i].number;
    if (n !== 6 && n !== 8) continue;
    const { x, y } = axialToPixel(board.tiles[i], layout);
    for (let c = 0; c < 6; c++) {
      const [cx, cy] = hexCorner(x, y, s, c);
      if (vertexKey(cx, cy) === vk) { count++; break; }
    }
  }
  return count;
}

export function filterByNeighbor68(
  vertices: Set<string>,
  board: Board,
  layout: HexLayout,
  required: 0 | 1,
): Set<string> {
  const out = new Set<string>();
  for (const vk of vertices) {
    if (countNeighbor68(vk, board, layout) === required) out.add(vk);
  }
  return out;
}

// Total 6/8 neighbours already claimed by existing settlements/cities. We
// allow at most ONE across the whole opening, so S2 must have zero left.
export function existingBuildings68Count(board: Board, layout: HexLayout): number {
  let total = 0;
  for (const vk of buildings.keys()) {
    total += countNeighbor68(vk, board, layout);
  }
  return total;
}

export function applyGuaranteed68IfActive(
  validV: Set<string>,
  board: Board,
  layout: HexLayout,
): Set<string> {
  if (!ruleGuaranteed68) return validV;
  if (getRevealMode() !== "fog") return validV;
  const step = getPlacementStep();
  if (step !== "initial-s1" && step !== "initial-s2") return validV;
  // S1: exactly one 6/8 neighbour. S2: zero, but only if S1 actually claimed
  // a 6/8 (the fallback case where the board had no candidate for S1 means
  // S2 still aims for one to satisfy the rule's guarantee).
  const alreadyClaimed = existingBuildings68Count(board, layout);
  const required: 0 | 1 = alreadyClaimed >= 1 ? 0 : 1;
  const filtered = filterByNeighbor68(validV, board, layout, required);
  // Fall back to the unfiltered set if the board has no candidates — the
  // rule shouldn't lock the player out entirely on a hostile layout.
  return filtered.size > 0 ? filtered : validV;
}

export function tradeRateFor(resource: ResourceKind, ports: Set<PortType>): 2 | 3 | 4 {
  if (ports.has(RESOURCE_TO_PORT_TYPE[resource])) return 2;
  if (ports.has("3:1")) return 3;
  return 4;
}

// A port is "owned" (its trade ratio active) when the player has a settlement
// or city on either of its two dock corners — the corners of the ocean tile's
// edge that touches the adjacent land tile.
export function ownedPortTypes(board: Board, layout: HexLayout): Set<PortType> {
  const out = new Set<PortType>();
  const s = layout.size;
  for (const ocean of board.oceans) {
    if (!ocean.port) continue;
    const { x, y } = axialToPixel(ocean, layout);
    // Edge i is between corners i and i+1; neighbor across edge i sits at the
    // HEX_DIRS angle (6 - i) mod 6 because the corner convention runs
    // clockwise while HEX_DIRS is keyed counter-clockwise from due-east.
    const ei = (6 - ocean.port.facing) % 6;
    const [ax, ay] = hexCorner(x, y, s, ei);
    const [bx, by] = hexCorner(x, y, s, (ei + 1) % 6);
    if (buildings.has(vertexKey(ax, ay)) || buildings.has(vertexKey(bx, by))) {
      out.add(ocean.port.type);
    }
  }
  return out;
}
