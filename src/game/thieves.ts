import { Board } from "../board";

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
