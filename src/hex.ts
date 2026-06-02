export type Axial = { q: number; r: number };

export type HexLayout = {
  size: number;
  originX: number;
  originY: number;
};

export function axialToPixel(h: Axial, layout: HexLayout): { x: number; y: number } {
  // pointy-top hex axial->pixel
  const x = layout.size * Math.sqrt(3) * (h.q + h.r / 2);
  const y = layout.size * 1.5 * h.r;
  return { x: x + layout.originX, y: y + layout.originY };
}

export function hexesInRadius(radius: number): Axial[] {
  const out: Axial[] = [];
  for (let q = -radius; q <= radius; q++) {
    const rMin = Math.max(-radius, -q - radius);
    const rMax = Math.min(radius, -q + radius);
    for (let r = rMin; r <= rMax; r++) out.push({ q, r });
  }
  return out;
}

export function tilesForRadius(radius: number): number {
  return 1 + 3 * radius * (radius + 1);
}

export function hexBounds(hexes: Axial[], layout: HexLayout) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const w = Math.sqrt(3) * layout.size;
  const h = 2 * layout.size;
  for (const hex of hexes) {
    const { x, y } = axialToPixel(hex, layout);
    minX = Math.min(minX, x - w / 2);
    maxX = Math.max(maxX, x + w / 2);
    minY = Math.min(minY, y - h / 2);
    maxY = Math.max(maxY, y + h / 2);
  }
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
}
