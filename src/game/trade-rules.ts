import { Board, PortType } from "../board";
import { axialToPixel, HexLayout } from "../hex";
import { hexCorner } from "../render/primitives";
import { buildings, vertexKey } from "./buildings";
import { ResourceKind, RESOURCE_TO_PORT_TYPE } from "./resources";

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

// Custom rule: across both opening settlements, the player ends up with
// exactly one 6/8-adjacent vertex. Placement itself is unconstrained — once
// the opening (S1, B1, S2, B2) is complete, the board's chance numbers are
// reshuffled in-place so exactly one settlement has a single 6/8 neighbour
// and the other has none.
let ruleGuaranteed68: boolean = false;

export function getRuleGuaranteed68(): boolean {
  return ruleGuaranteed68;
}

export function setRuleGuaranteed68(v: boolean) {
  ruleGuaranteed68 = v;
}

// Custom rule: the two opening road segments (B1 and B2) must share an
// endpoint, so the player's first network is a single connected chain
// rather than two disjoint pairs. Enforced as a placement filter on S2
// and B2 — see validSettlementVertices / validBridgeEdges.
let ruleLinkedOpening: boolean = false;

export function getRuleLinkedOpening(): boolean {
  return ruleLinkedOpening;
}

export function setRuleLinkedOpening(v: boolean) {
  ruleLinkedOpening = v;
}

// Custom rule: when a 7 is rolled the robber penalty (discard half on > 7
// cards) hits every player EXCEPT the roller. The roller still moves the
// robber and steals as normal. Checked by triggerSevenSequence in main.ts.
let ruleThiefSparesCaster: boolean = false;

export function getRuleThiefSparesCaster(): boolean {
  return ruleThiefSparesCaster;
}

export function setRuleThiefSparesCaster(v: boolean) {
  ruleThiefSparesCaster = v;
}

// Tile indices that share the given vertex as a corner.
function tilesAroundVertex(vk: string, board: Board, layout: HexLayout): Set<number> {
  const s = layout.size;
  const out = new Set<number>();
  for (let i = 0; i < board.tiles.length; i++) {
    const { x, y } = axialToPixel(board.tiles[i], layout);
    for (let c = 0; c < 6; c++) {
      const [cx, cy] = hexCorner(x, y, s, c);
      if (vertexKey(cx, cy) === vk) { out.add(i); break; }
    }
  }
  return out;
}

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Reshuffle the board's number tokens so that exactly one of player 0's two
// opening settlements has a single 6/8 neighbour and the other has none.
// Preserves the existing number-pool composition (same multiset of numbers,
// deserts stay numberless). No-op if the rule is off, fewer than two
// settlements exist, the pool has no 6/8s, or no exclusive non-desert
// neighbour is available.
//
// TODO(multiplayer-6/8): currently only enforces for player 0 (whoever
// placed first in turn order). Per-player guarantees for 3+ players
// require simultaneous constraint satisfaction across overlapping
// neighbours and aren't worth the complexity for this scaffolding pass.
export function reshuffleFor68Rule(board: Board, layout: HexLayout, playerId: number = 0) {
  if (!ruleGuaranteed68) return;
  const settlementVKs = [...buildings.entries()]
    .filter(([, rec]) => rec.kind === "settlement" && rec.ownerId === playerId)
    .map(([v]) => v);
  if (settlementVKs.length !== 2) return;

  const tA = tilesAroundVertex(settlementVKs[0], board, layout);
  const tB = tilesAroundVertex(settlementVKs[1], board, layout);

  // Numbered tile indices only — deserts have no number and stay out of the pool.
  const numbered = (set: Set<number>) =>
    new Set([...set].filter((i) => board.tiles[i].number != null));
  const ntA = numbered(tA);
  const ntB = numbered(tB);
  const exclA = new Set([...ntA].filter((i) => !ntB.has(i)));
  const exclB = new Set([...ntB].filter((i) => !ntA.has(i)));
  const shared = new Set([...ntA].filter((i) => ntB.has(i)));

  // Pool composition.
  const numberedIdx: number[] = [];
  for (let i = 0; i < board.tiles.length; i++) {
    if (board.tiles[i].number != null) numberedIdx.push(i);
  }
  const allNums = numberedIdx.map((i) => board.tiles[i].number!);
  const sixEight = allNums.filter((n) => n === 6 || n === 8);
  const rest = allNums.filter((n) => n !== 6 && n !== 8);
  if (sixEight.length === 0) return;

  // Pick the "winner" settlement (the one that gets the single 6/8). Prefer
  // whichever has more exclusive non-desert neighbours so we always have at
  // least one slot to land the 6/8 on; if both qualify, pick A.
  let winnerExcl: Set<number>;
  let loserExcl: Set<number>;
  if (exclA.size >= 1 && exclA.size >= exclB.size) {
    winnerExcl = exclA;
    loserExcl = exclB;
  } else if (exclB.size >= 1) {
    winnerExcl = exclB;
    loserExcl = exclA;
  } else {
    return; // No exclusive numbered neighbour anywhere — can't satisfy rule.
  }

  // Tiles that touch neither settlement — safe overflow targets for any
  // remaining 6/8s in the pool.
  const otherTiles = numberedIdx.filter((i) => !ntA.has(i) && !ntB.has(i));

  const assignment = new Map<number, number>();
  const sixPool = shuffleInPlace([...sixEight]);
  const restPool = shuffleInPlace([...rest]);
  const take = (pool: number[]) => pool.pop()!;

  // 1. One 6/8 on a random winner-exclusive tile.
  const winnerSlots = shuffleInPlace([...winnerExcl]);
  assignment.set(winnerSlots[0], take(sixPool));

  // 2. Remaining 6/8s go to "other" tiles first; only if those run out do we
  //    spill into shared / loser-exclusive (rule-violating fallback, but
  //    preserves the pool on hostile boards).
  const overflow = [
    ...shuffleInPlace(otherTiles.filter((i) => !assignment.has(i))),
    ...shuffleInPlace([...shared].filter((i) => !assignment.has(i))),
    ...shuffleInPlace([...loserExcl].filter((i) => !assignment.has(i))),
  ];
  for (const i of overflow) {
    if (sixPool.length === 0) break;
    assignment.set(i, take(sixPool));
  }

  // 3. Fill every remaining numbered slot with the non-6/8 pool.
  const remaining = shuffleInPlace(numberedIdx.filter((i) => !assignment.has(i)));
  for (const i of remaining) {
    assignment.set(i, take(restPool));
  }

  for (const i of numberedIdx) {
    board.tiles[i].number = assignment.get(i)!;
  }
}

export function tradeRateFor(resource: ResourceKind, ports: Set<PortType>): 2 | 3 | 4 {
  if (ports.has(RESOURCE_TO_PORT_TYPE[resource])) return 2;
  if (ports.has("3:1")) return 3;
  return 4;
}

// A port is "owned" (its trade ratio active) when the given player has a
// settlement or city on either of its two dock corners — the corners of the
// ocean tile's edge that touches the adjacent land tile.
export function ownedPortTypes(playerId: number, board: Board, layout: HexLayout): Set<PortType> {
  const out = new Set<PortType>();
  const s = layout.size;
  const ownedAt = (k: string) => {
    const rec = buildings.get(k);
    return !!rec && rec.ownerId === playerId;
  };
  for (const ocean of board.oceans) {
    if (!ocean.port) continue;
    const { x, y } = axialToPixel(ocean, layout);
    // Edge i is between corners i and i+1; neighbor across edge i sits at the
    // HEX_DIRS angle (6 - i) mod 6 because the corner convention runs
    // clockwise while HEX_DIRS is keyed counter-clockwise from due-east.
    const ei = (6 - ocean.port.facing) % 6;
    const [ax, ay] = hexCorner(x, y, s, ei);
    const [bx, by] = hexCorner(x, y, s, (ei + 1) % 6);
    if (ownedAt(vertexKey(ax, ay)) || ownedAt(vertexKey(bx, by))) {
      out.add(ocean.port.type);
    }
  }
  return out;
}
