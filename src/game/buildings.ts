// Buildings (settlement → city → empty) pinned at hex-tile corners. Stored as
// quantised world coords so the same corner shared by two land tiles collapses
// into a single vertex.
export type BuildingKind = "settlement" | "city";
export type BuildingRecord = { kind: BuildingKind; ownerId: number };
export const buildings = new Map<string, BuildingRecord>();
export const vertexKey = (x: number, y: number) => `${Math.round(x * 4)}|${Math.round(y * 4)}`;

// Bridges live on hex edges, keyed by edge-midpoint world coords. The variant
// records the edge orientation so we know which sprite to use. Mirrored edges
// (e.g. edges 1 and 4) share a variant since the line is the same orientation.
export type BridgeVariant = "30up" | "30down" | "straight";
// Bridge stores the variant + the two endpoint coords so we can stroke a player-
// colored road along the hex edge underneath the sprite.
export type BridgeRecord = { variant: BridgeVariant; a: [number, number]; b: [number, number]; ownerId: number };
export const bridges = new Map<string, BridgeRecord>();
export const edgeKey = (x: number, y: number) => `e:${Math.round(x * 4)}|${Math.round(y * 4)}`;

export function edgeVariant(edgeIdx: number): BridgeVariant {
  // pointy-top edges: 0,3 are vertical → "straight" (assets pending);
  // 1,4 share the "\" diagonal → "30down"; 2,5 share the "/" diagonal → "30up".
  if (edgeIdx === 0 || edgeIdx === 3) return "straight";
  if (edgeIdx === 1 || edgeIdx === 4) return "30up";
  return "30down";
}
