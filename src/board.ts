import { Axial, hexesInRadius } from "./hex";
import { mulberry32, randInt, shuffle } from "./rng";

export type TileType = "clay" | "desert" | "forest" | "mountain" | "sheep" | "wheat";

export const TILE_TYPES: TileType[] = ["clay", "desert", "forest", "mountain", "sheep", "wheat"];

export type Tile = Axial & { type: TileType };

export type Board = {
  seed: number;
  radius: number;
  tiles: Tile[];
};

const MIN_RADIUS = 1;
const MAX_RADIUS = 4;

export function generateBoard(seed: number, fixedRadius?: number): Board {
  const rng = mulberry32(seed);
  const radius =
    fixedRadius && fixedRadius > 0
      ? Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, Math.floor(fixedRadius)))
      : randInt(rng, MIN_RADIUS, MAX_RADIUS);

  const cells = hexesInRadius(radius);
  const types = shuffle(
    rng,
    cells.map((_, i) => TILE_TYPES[i % TILE_TYPES.length])
  );
  const tiles: Tile[] = cells.map((c, i) => ({ ...c, type: types[i] }));
  return { seed, radius, tiles };
}
