import { Board } from "../board";
import { axialToPixel, HexLayout } from "../hex";
import { hexCorner } from "../render/primitives";
import { buildings, vertexKey } from "./buildings";

// Tile index where the thieves currently sit. -1 = not placed (e.g. board has
// no desert, or before the first restart). Updated when the board (re)starts
// to default to the first desert tile.
let thievesTileIdx: number = -1;

export function getThievesTileIdx(): number {
  return thievesTileIdx;
}

export function setThievesTileIdx(v: number) {
  thievesTileIdx = v;
}

export function defaultThievesIdx(board: Board): number {
  for (let i = 0; i < board.tiles.length; i++) {
    if (board.tiles[i].type === "desert") return i;
  }
  return -1;
}

// Eligible victims for a robber steal on tileIdx: owners of any settlement or
// city at one of the tile's 6 corners, excluding the robber-mover, and only
// when they hold at least 1 resource card. Returned in stable owner-id order
// for deterministic UI ordering.
// Eligible victims for a robber steal on tileIdx: owners of any settlement or
// city at one of the tile's 6 corners, excluding the robber-mover, filtered
// by `hasCardsFn` (so the caller — which owns the hand model — can answer
// "does player X hold > 0 cards"). Returned in stable owner-id order for
// deterministic UI ordering.
export function eligibleVictimsFor(
  tileIdx: number,
  robberId: number,
  board: Board,
  layout: HexLayout,
  hasCardsFn: (playerId: number) => boolean,
): number[] {
  if (tileIdx < 0 || !board.tiles[tileIdx]) return [];
  const tile = board.tiles[tileIdx];
  const { x: tx, y: ty } = axialToPixel(tile, layout);
  const owners = new Set<number>();
  for (let i = 0; i < 6; i++) {
    const [cx, cy] = hexCorner(tx, ty, layout.size, i);
    const rec = buildings.get(vertexKey(cx, cy));
    if (!rec) continue;
    if (rec.ownerId === robberId) continue;
    if (!hasCardsFn(rec.ownerId)) continue;
    owners.add(rec.ownerId);
  }
  return [...owners].sort((a, b) => a - b);
}
