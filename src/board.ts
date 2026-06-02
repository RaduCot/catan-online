import { Axial, hexesInRadius, tilesForRadius } from "./hex";
import { mulberry32, randInt, shuffle } from "./rng";

export type TileType = "bricks" | "desert" | "forest" | "mountain" | "sheep" | "wheat";
export type MapStyle = "standard" | "continent" | "continent-lakes";
export const MAP_STYLES: MapStyle[] = ["standard", "continent", "continent-lakes"];

// Port types: 3:1 generic, or 2:1 for a specific resource.
export type PortType = "3:1" | "bricks" | "forest" | "mountain" | "sheep" | "wheat";
const PORT_RESOURCES: PortType[] = ["bricks", "forest", "mountain", "sheep", "wheat"];

export type Port = { type: PortType; facing: number }; // facing = HEX_DIRS index of adjacent land
export type OceanTile = Axial & { port?: Port; lake?: boolean };

export const TILE_TYPES: TileType[] = ["bricks", "desert", "forest", "mountain", "sheep", "wheat"];

const RESOURCE_TYPES: TileType[] = ["bricks", "forest", "mountain", "sheep", "wheat"];

// 1 desert for radius <= 2 (classic Catan ratio); for larger boards keep
// roughly the same desert-per-tile density (~1 per 19 tiles).
function desertCount(radius: number, tiles: number): number {
  if (radius <= 2) return 1;
  return Math.max(1, Math.round(tiles / 19));
}

export type Tile = Axial & { type: TileType; number?: number };

// Relative weights mirroring the Catan distribution: 7 is omitted (robber),
// 2 and 12 are rare (one each in a 19-tile board), the rest are common (two each).
// For other radii we scale these weights to the number of tokens needed.
const NUMBER_WEIGHTS: { value: number; weight: number }[] = [
  { value: 2, weight: 1 },
  { value: 3, weight: 2 },
  { value: 4, weight: 2 },
  { value: 5, weight: 2 },
  { value: 6, weight: 2 },
  { value: 8, weight: 2 },
  { value: 9, weight: 2 },
  { value: 10, weight: 2 },
  { value: 11, weight: 2 },
  { value: 12, weight: 1 },
];

// Order used to assign leftover tokens after the proportional split,
// biased toward middle numbers (more likely dice rolls).
const FILL_ORDER = [6, 8, 5, 9, 4, 10, 3, 11, 2, 12];

function buildNumberPool(count: number): number[] {
  const totalWeight = NUMBER_WEIGHTS.reduce((s, e) => s + e.weight, 0);
  const counts = new Map<number, number>();
  let assigned = 0;
  for (const { value, weight } of NUMBER_WEIGHTS) {
    const c = Math.floor((count * weight) / totalWeight);
    counts.set(value, c);
    assigned += c;
  }
  let remaining = count - assigned;
  let i = 0;
  while (remaining > 0) {
    const v = FILL_ORDER[i % FILL_ORDER.length];
    counts.set(v, (counts.get(v) ?? 0) + 1);
    remaining--;
    i++;
  }
  const pool: number[] = [];
  for (const { value } of NUMBER_WEIGHTS) {
    for (let k = 0; k < (counts.get(value) ?? 0); k++) pool.push(value);
  }
  return pool;
}

export type Board = {
  seed: number;
  radius: number;
  tiles: Tile[];
  oceans: OceanTile[];
};

const MIN_RADIUS = 1;
const MAX_RADIUS = 4;

const HEX_DIRS: Axial[] = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
  { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
];

// Smoothed value-noise sampler seeded by the given rng.
function makeNoise(rng: () => number) {
  const N = 64;
  const grid = new Float32Array(N * N);
  for (let i = 0; i < grid.length; i++) grid[i] = rng();
  return (x: number, y: number) => {
    const fx = ((x % N) + N) % N;
    const fy = ((y % N) + N) % N;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const x1 = (x0 + 1) % N, y1 = (y0 + 1) % N;
    const sx = fx - x0, sy = fy - y0;
    const a = grid[y0 * N + x0], b = grid[y0 * N + x1];
    const c = grid[y1 * N + x0], d = grid[y1 * N + x1];
    const u = sx * sx * (3 - 2 * sx);
    const v = sy * sy * (3 - 2 * sy);
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
  };
}

// Grow a connected blob of `target` hexes from the origin, biased by smoothed
// noise so the silhouette is organic rather than a regular hex.
// Plan lake cluster sizes. For r<=2 lakes are always single tiles; for r>=3
// they're a mix of single specks (1) and bigger lakes (2 or 3 tiles).
// Budget-based lake plan. The total water budget scales with land area
// (~14%) and is split across multiple lakes whose count and size both scale
// with radius — no more 1-tile specks and no more single-lake boards.
const MIN_LAKE_SIZE = 2;
function planLakes(radius: number, rng: () => number): number[] {
  if (radius <= 1) return rng() < 0.3 ? [2] : [];
  const landArea = 1 + 3 * radius * (radius + 1);
  const budget = Math.max(MIN_LAKE_SIZE + 1, Math.round(landArea * 0.14));
  const maxSize = Math.max(MIN_LAKE_SIZE + 1, Math.floor(radius * 1.5));

  // Number of lakes: floor scales with radius (r=2:1, r=3:2, r=4:3…), ceiling
  // is whatever the budget can afford.
  const minLakes = Math.max(1, radius - 1);
  const maxLakes = Math.max(minLakes, Math.floor(budget / MIN_LAKE_SIZE));
  const numLakes = minLakes + Math.floor(rng() * (maxLakes - minLakes + 1));

  // Start each lake at MIN_LAKE_SIZE then distribute the remainder, capping each
  // at maxSize so no single lake hoards the budget.
  const sizes: number[] = new Array(numLakes).fill(MIN_LAKE_SIZE);
  let pool = budget - numLakes * MIN_LAKE_SIZE;
  let safety = pool * 8;
  while (pool > 0 && safety-- > 0) {
    const i = Math.floor(rng() * numLakes);
    if (sizes[i] < maxSize) { sizes[i]++; pool--; }
  }
  return sizes;
}

function continentCells(rng: () => number, target: number, radius: number, withLakes: boolean): Axial[] {
  const lakePlan = withLakes ? planLakes(radius, rng) : [];
  const totalLakeTiles = lakePlan.reduce((s, n) => s + n, 0);
  // Grow extra tiles so that after carving lakes we still hit `target` land tiles.
  const growTarget = target + totalLakeTiles;

  const noise = makeNoise(rng);
  const key = (q: number, r: number) => `${q},${r}`;
  const baseScore = (q: number, r: number) => {
    const n = noise(q * 0.35 + 17, r * 0.35 + 31)
            + 0.5 * noise(q * 0.9 + 5, r * 0.9 + 91);
    const dist = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
    return n - dist * 0.08;
  };
  const chosen = new Map<string, Axial>();
  const frontier = new Map<string, Axial>();
  const countChosenNeighbors = (q: number, r: number) => {
    let n = 0;
    for (const d of HEX_DIRS) if (chosen.has(key(q + d.q, r + d.r))) n++;
    return n;
  };

  chosen.set(key(0, 0), { q: 0, r: 0 });
  for (const d of HEX_DIRS) frontier.set(key(d.q, d.r), { q: d.q, r: d.r });

  while (chosen.size < growTarget && frontier.size > 0) {
    let bestKey = "", bestScore = -Infinity;
    for (const [k, c] of frontier) {
      // Diminishing-returns neighbor bonus: jumping from 0->1 chosen neighbor
      // adds 0 (allows 1-tile corners), 1->2 adds ~0.7, 2->3 adds ~0.3, etc.
      // The result: 2-tile spurs are cheap; extending them to 3 is expensive;
      // sharp single-tile corners stay possible when noise favours them.
      const n = countChosenNeighbors(c.q, c.r);
      const neighborBonus = n <= 1 ? 0 : 0.7 + 0.25 * (n - 2);
      const jitter = 0.25 * (rng() - 0.5);
      const s = baseScore(c.q, c.r) + neighborBonus + jitter;
      if (s > bestScore) { bestScore = s; bestKey = k; }
    }
    const cell = frontier.get(bestKey)!;
    frontier.delete(bestKey);
    chosen.set(bestKey, cell);
    for (const d of HEX_DIRS) {
      const nq = cell.q + d.q, nr = cell.r + d.r;
      const k = key(nq, nr);
      if (chosen.has(k) || frontier.has(k)) continue;
      frontier.set(k, { q: nq, r: nr });
    }
  }
  // Noise field for lake placement — used to score seed candidates and growth
  // directions so multiple lakes prefer noise-high regions (organic clusters)
  // instead of scattering as random specks.
  const lakeNoise = makeNoise(rng);
  const lakeScore = (q: number, r: number) =>
    lakeNoise(q * 0.45 + 13, r * 0.45 + 71) +
    0.5 * lakeNoise(q * 1.1 + 29, r * 1.1 + 99);

  // Carve lakes as connected clusters of the planned sizes. A cluster is valid
  // if every cell in it has all of its "outward" neighbors (those not in the
  // cluster) present in `chosen` — guaranteeing the lake is fully surrounded
  // by land and removing it cannot disconnect the continent.
  const removed = new Set<string>();
  const tryCarve = (size: number): boolean => {
    const interior = [...chosen.values()].filter(
      (c) => !(c.q === 0 && c.r === 0) && !removed.has(key(c.q, c.r)) && countChosenNeighbors(c.q, c.r) === 6
    );
    interior.sort((a, b) => lakeScore(b.q, b.r) - lakeScore(a.q, a.r));
    for (const seed of interior) {
      if (removed.has(key(seed.q, seed.r))) continue;
      const cluster: Axial[] = [seed];
      const G = new Set<string>([key(seed.q, seed.r)]);
      const outwardOk = (c: Axial) => {
        // every non-cluster neighbor must be a chosen, non-removed land tile —
        // this alone guarantees the lake never touches the open sea.
        for (const d of HEX_DIRS) {
          const nq = c.q + d.q, nr = c.r + d.r;
          const k = key(nq, nr);
          if (G.has(k)) continue;
          if (!chosen.has(k) || removed.has(k) || (nq === 0 && nr === 0)) return false;
        }
        return true;
      };
      while (cluster.length < size) {
        const candidates: Axial[] = [];
        for (const cell of cluster) {
          for (const d of HEX_DIRS) {
            const nq = cell.q + d.q, nr = cell.r + d.r;
            const k = key(nq, nr);
            if (G.has(k) || removed.has(k) || !chosen.has(k)) continue;
            if (nq === 0 && nr === 0) continue;
            const cand = { q: nq, r: nr };
            G.add(k);
            const ok = cluster.every(outwardOk) && outwardOk(cand);
            G.delete(k);
            if (ok) candidates.push(cand);
          }
        }
        if (candidates.length === 0) break;
        // Grow toward the noise-high neighbor so lakes acquire organic shapes.
        candidates.sort((a, b) => lakeScore(b.q, b.r) - lakeScore(a.q, a.r));
        const pick = candidates[0];
        cluster.push(pick);
        G.add(key(pick.q, pick.r));
      }
      if (cluster.length >= 1) {
        for (const c of cluster) removed.add(key(c.q, c.r));
        return true;
      }
    }
    return false;
  };
  for (const size of lakePlan) {
    // try planned size, falling back toward MIN_LAKE_SIZE — never carve a 1-tile speck.
    for (let s = size; s >= MIN_LAKE_SIZE; s--) {
      if (tryCarve(s)) break;
    }
  }
  for (const k of removed) chosen.delete(k);

  // Avoid the degenerate case where noise produced exactly the standard hex:
  // pop one perimeter tile and graft on an outside neighbor instead. Skipped
  // when any lake was carved — lakes already make the shape non-standard, and
  // dropping a perimeter tile could leave the lake adjacent to ocean.
  const ringRadius = Math.max(...[...chosen.values()].map((c) => Math.max(Math.abs(c.q), Math.abs(c.r), Math.abs(c.q + c.r))));
  const expected = tilesForRadius(ringRadius);
  if (removed.size === 0 && chosen.size === expected) {
    const isStandard = [...chosen.values()].every(
      (c) => Math.max(Math.abs(c.q), Math.abs(c.r), Math.abs(c.q + c.r)) <= ringRadius
    );
    if (isStandard) {
      const perimeter = [...chosen.values()].filter(
        (c) => Math.max(Math.abs(c.q), Math.abs(c.r), Math.abs(c.q + c.r)) === ringRadius
      );
      const drop = perimeter[Math.floor(rng() * perimeter.length)];
      chosen.delete(key(drop.q, drop.r));
      outer: for (const tile of chosen.values()) {
        for (const d of HEX_DIRS) {
          const nq = tile.q + d.q, nr = tile.r + d.r;
          const dist = Math.max(Math.abs(nq), Math.abs(nr), Math.abs(nq + nr));
          if (dist > ringRadius && !chosen.has(key(nq, nr))) {
            chosen.set(key(nq, nr), { q: nq, r: nr });
            break outer;
          }
        }
      }
    }
  }
  return [...chosen.values()];
}

export function generateBoard(seed: number, fixedRadius?: number, style: MapStyle = "standard"): Board {
  const rng = mulberry32(seed);
  const radius =
    fixedRadius && fixedRadius > 0
      ? Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, Math.floor(fixedRadius)))
      : randInt(rng, MIN_RADIUS, MAX_RADIUS);

  const cells = style === "standard"
    ? hexesInRadius(radius)
    : continentCells(rng, tilesForRadius(radius), radius, style === "continent-lakes");
  const deserts = desertCount(radius, cells.length);
  const nonDesert = cells.length - deserts;
  const base = Math.floor(nonDesert / RESOURCE_TYPES.length);
  const extra = nonDesert - base * RESOURCE_TYPES.length;
  const order = shuffle(rng, [...RESOURCE_TYPES]);
  const pool: TileType[] = [];
  order.forEach((t, i) => {
    const count = base + (i < extra ? 1 : 0);
    for (let k = 0; k < count; k++) pool.push(t);
  });
  for (let k = 0; k < deserts; k++) pool.push("desert");
  const types = shuffle(rng, pool);

  // build number tokens: one per non-desert tile, drawn from the Catan pool
  // (no 7; 2 and 12 are singletons, the rest are paired). Cycle the pool if more tiles are needed.
  const numbered = types.filter((t) => t !== "desert").length;
  const numbers = shuffle(rng, buildNumberPool(numbered));

  let ni = 0;
  const tiles: Tile[] = cells.map((c, i) => {
    const type = types[i];
    if (type === "desert") return { ...c, type };
    return { ...c, type, number: numbers[ni++] };
  });

  // Ocean perimeter + ports — works for any land shape (standard hex,
  // continent, continent-with-lakes). Interior gaps (lakes) are surfaced as
  // ocean tiles with no port.
  const oceans: OceanTile[] = generateOceans(rng, new Set(cells.map((c) => `${c.q},${c.r}`)), cells);

  return { seed, radius, tiles, oceans };
}

function generateOceans(rng: () => number, land: Set<string>, cells: Axial[]): OceanTile[] {
  if (cells.length === 0) return [];
  const key = (q: number, r: number) => `${q},${r}`;

  // All non-land cells adjacent to any land tile.
  const candidates = new Map<string, Axial>();
  for (const c of cells) {
    for (const d of HEX_DIRS) {
      const nq = c.q + d.q, nr = c.r + d.r;
      const k = key(nq, nr);
      if (!land.has(k) && !candidates.has(k)) candidates.set(k, { q: nq, r: nr });
    }
  }

  // Flood-fill from a far-away seed through non-land cells to identify the
  // outer ocean. Candidates not reached by the fill are enclosed → lakes.
  const maxRing = Math.max(
    ...cells.map((c) => Math.max(Math.abs(c.q), Math.abs(c.r), Math.abs(c.q + c.r)))
  );
  const bound = maxRing + 3;
  const seed = { q: bound, r: 0 };
  const outer = new Set<string>();
  const visited = new Set<string>([key(seed.q, seed.r)]);
  const queue: Axial[] = [seed];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const d of HEX_DIRS) {
      const nq = cur.q + d.q, nr = cur.r + d.r;
      const k = key(nq, nr);
      if (visited.has(k) || land.has(k)) continue;
      const dist = Math.max(Math.abs(nq), Math.abs(nr), Math.abs(nq + nr));
      if (dist > bound) continue;
      visited.add(k);
      if (candidates.has(k)) outer.add(k);
      queue.push({ q: nq, r: nr });
    }
  }

  const outerCells: Axial[] = [];
  const lakeCells: Axial[] = [];
  for (const [k, c] of candidates) (outer.has(k) ? outerCells : lakeCells).push(c);

  // Sort outer cells by angle around the land centroid so "every other"
  // port placement is geometric rather than topological.
  let ccq = 0, ccr = 0;
  for (const c of cells) { ccq += c.q; ccr += c.r; }
  ccq /= cells.length; ccr /= cells.length;
  const angle = (c: Axial) => {
    const x = Math.sqrt(3) * (c.q - ccq + (c.r - ccr) / 2);
    const y = 1.5 * (c.r - ccr);
    return Math.atan2(y, x);
  };
  outerCells.sort((a, b) => angle(a) - angle(b));

  // Guarantee at least one of every port type (5 resources + 3:1 = 6 total),
  // capped at the number of ocean tiles available. Default density is roughly
  // every-other ocean tile.
  const N = outerCells.length;
  const minPorts = Math.min(N, PORT_RESOURCES.length + 1);
  const portCount = Math.max(minPorts, Math.floor(N / 2));

  // Distribute ports as evenly as possible across all 6 types (5 specifics + 3:1)
  // — no flooding the leftover slots with only 3:1.
  const allPortTypes: PortType[] = [...PORT_RESOURCES, "3:1"];
  const portPool: PortType[] = [];
  const base = Math.floor(portCount / allPortTypes.length);
  const extra = portCount - base * allPortTypes.length;
  const order = shuffle(rng, [...allPortTypes]);
  order.forEach((t, i) => {
    const count = base + (i < extra ? 1 : 0);
    for (let k = 0; k < count; k++) portPool.push(t);
  });
  // Order the pool around the perimeter avoiding consecutive duplicates and
  // wrap-around duplicates between the last and first position.
  const remaining = shuffle(rng, portPool);
  const shuffledPorts: PortType[] = [];
  for (let i = 0; i < portCount; i++) {
    const prev = shuffledPorts.length ? shuffledPorts[shuffledPorts.length - 1] : null;
    const first = shuffledPorts.length ? shuffledPorts[0] : null;
    const isLast = i === portCount - 1;
    const valid: number[] = [];
    for (let j = 0; j < remaining.length; j++) {
      if (remaining[j] === prev) continue;
      if (isLast && remaining[j] === first) continue;
      valid.push(j);
    }
    // fall back gracefully if no candidate satisfies the constraint
    const pool = valid.length > 0 ? valid : remaining.map((_, j) => j);
    const idx = pool[Math.floor(rng() * pool.length)];
    shuffledPorts.push(remaining[idx]);
    remaining.splice(idx, 1);
  }

  // Distribute port positions evenly around the perimeter regardless of density.
  const portPositions = new Set<number>();
  const phase = Math.floor(rng() * N);
  for (let i = 0; i < portCount; i++) {
    portPositions.add((Math.round((i * N) / portCount) + phase) % N);
  }

  const oceans: OceanTile[] = lakeCells.map((c) => ({ ...c, lake: true }));
  let portIdx = 0;
  outerCells.forEach((c, i) => {
    if (!portPositions.has(i) || portIdx >= shuffledPorts.length) {
      oceans.push({ ...c });
      return;
    }
    let facing = -1;
    for (let d = 0; d < HEX_DIRS.length; d++) {
      const dir = HEX_DIRS[d];
      if (land.has(key(c.q + dir.q, c.r + dir.r))) { facing = d; break; }
    }
    if (facing < 0) { oceans.push({ ...c }); return; }
    oceans.push({ ...c, port: { type: shuffledPorts[portIdx++], facing } });
  });
  return oceans;
}
