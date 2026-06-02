import { Board } from "../board";
import { hexBounds, HexLayout } from "../hex";

export type View = { tx: number; ty: number; zoom: number };

export function fitLayout(board: Board, canvasW: number, canvasH: number, padding = 40): HexLayout {
  const all = [...board.tiles, ...board.oceans];
  const probe: HexLayout = { size: 1, originX: 0, originY: 0 };
  const b = hexBounds(all, probe);
  const scale = Math.min(
    (canvasW - padding * 2) / b.width,
    (canvasH - padding * 2) / b.height
  );
  const size = scale;
  const real: HexLayout = { size, originX: 0, originY: 0 };
  const rb = hexBounds(all, real);
  const originX = (canvasW - rb.width) / 2 - rb.minX;
  const originY = (canvasH - rb.height) / 2 - rb.minY;
  return { size, originX, originY };
}

// Camera limits driven by the playable area's actual pixel bounds.
// - minZoom: keep the playable area at least PLAY_MIN_ON_SCREEN of the
//   shorter viewport edge so it can't be shrunk into nothing.
// - pan clamp: leave at least PAN_MARGIN of overlap between the board bbox
//   and the viewport so the user can't drag the board fully off-screen.
export const PLAY_MIN_ON_SCREEN = 0.85;
// Min fraction of the board's *shorter* on-screen dimension that must remain visible.
export const PAN_KEEP_VISIBLE = 0.6;

export function computeMinZoom(board: Board, layout: HexLayout, cssW: number, cssH: number): number {
  const all = [...board.tiles, ...board.oceans];
  if (!all.length) return 0.1;
  const bbox = hexBounds(all, layout);
  const minDim = Math.min(cssW, cssH);
  const boardMin = Math.min(bbox.width, bbox.height);
  return (minDim * PLAY_MIN_ON_SCREEN) / boardMin;
}

export function clampView(board: Board, view: View, layout: HexLayout, cssW: number, cssH: number) {
  const all = [...board.tiles, ...board.oceans];
  if (!all.length) return;
  const bbox = hexBounds(all, layout);
  const minZoom = computeMinZoom(board, layout, cssW, cssH);
  view.zoom = Math.max(minZoom, Math.min(8, view.zoom));
  // The reachable world region is a fixed rectangle around the board, sized
  // by panSlack. At any zoom, the visible viewport must stay inside this rect
  // — so zooming in lets you pan further (more world coords per screen pixel)
  // but you still can't reveal anything that wasn't reachable at min zoom.
  const panSlack = 1 - PAN_KEEP_VISIBLE;
  const cX = (bbox.minX + bbox.maxX) / 2;
  const cY = (bbox.minY + bbox.maxY) / 2;
  const halfBoundsX = bbox.width * (0.5 + panSlack);
  const halfBoundsY = bbox.height * (0.5 + panSlack);
  const vpW = cssW / view.zoom;
  const vpH = cssH / view.zoom;
  const vcX = (cssW / 2 - view.tx) / view.zoom;
  const vcY = (cssH / 2 - view.ty) / view.zoom;
  const newVcX = vpW >= halfBoundsX * 2 ? cX : Math.max(cX - halfBoundsX + vpW / 2, Math.min(cX + halfBoundsX - vpW / 2, vcX));
  const newVcY = vpH >= halfBoundsY * 2 ? cY : Math.max(cY - halfBoundsY + vpH / 2, Math.min(cY + halfBoundsY - vpH / 2, vcY));
  view.tx = cssW / 2 - newVcX * view.zoom;
  view.ty = cssH / 2 - newVcY * view.zoom;
}
