import { HexLayout } from "../hex";
import { BuildingImgs } from "../assets/loaders";
import { BridgeVariant } from "../game/buildings";
import { PlacementGraph, PlacementStep } from "../game/placement";
import { BridgeTuning } from "./buildings";

// Snapshot of valid placement targets + hovered snap. Recomputed each render
// from the current placement step and existing buildings/bridges.
export type PlacementHintState = {
  step: PlacementStep;
  vertices: Set<string>;
  cities: Set<string>;
  edges: Set<string>;
  hover: { kind: "vertex" | "edge"; key: string } | null;
};

export function drawPlacementHints(
  ctx: CanvasRenderingContext2D,
  graph: PlacementGraph,
  hints: PlacementHintState,
  layout: HexLayout,
  imgs: BuildingImgs,
  bridgeTuning: Record<BridgeVariant, BridgeTuning>,
  buildingScale: number,
  settlementOffYK: number,
  now: number,
  phase: "marks" | "preview",
) {
  if (hints.step === "free" && hints.vertices.size === 0 && hints.edges.size === 0 && hints.cities.size === 0) return;
  if (buildingScale <= 0) return;
  const s = layout.size;
  // Slow pulse — sine cycling once per ~1.6s for both vertices and edges.
  const pulse = 0.5 + 0.5 * Math.sin((now / 1000) * (Math.PI * 2 / 1.6));

  if (phase === "preview") {
    // Hover preview only — sits on top of the buildings so the ghost is
    // never occluded by a neighbouring piece.
    if (hints.hover) {
      ctx.save();
      ctx.globalAlpha = 0.55;
      if (hints.hover.kind === "vertex") {
        const v = graph.vertices.get(hints.hover.key);
        if (v) {
          const isUpgrade = hints.cities.has(hints.hover.key);
          // Ghosts use the untinted source artwork so the preview reads as a
          // neutral "what would land here" rather than a claimed piece.
          const sprite = isUpgrade ? imgs.city : imgs.settlement;
          const size = s * (isUpgrade ? 0.85 : 0.7) * buildingScale;
          const offY = settlementOffYK * s;
          ctx.drawImage(sprite, v[0] - size / 2, v[1] - size / 2 + offY, size, size);
        }
      } else {
        const e = graph.edges.get(hints.hover.key);
        if (e) {
          const variant = e.variant;
          const sprite: HTMLImageElement | null = variant === "30up"
            ? imgs.bridge30up
            : variant === "30down"
            ? imgs.bridge30down
            : imgs.bridgeStraight;
          if (sprite) {
            const tune = bridgeTuning[variant];
            const size = s * tune.scale * buildingScale;
            const drawX = e.mid[0] + tune.offX * s;
            const drawY = e.mid[1] + tune.offY * s;
            const rad = (tune.rotDeg * Math.PI) / 180;
            ctx.save();
            ctx.translate(drawX, drawY);
            if (rad) ctx.rotate(rad);
            ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
            ctx.restore();
          }
        }
      }
      ctx.restore();
    }
    return;
  }

  // Valid settlement vertices — pulsing gold rings.
  for (const vk of hints.vertices) {
    const v = graph.vertices.get(vk);
    if (!v) continue;
    const hovered = hints.hover?.kind === "vertex" && hints.hover.key === vk;
    const r = s * (hovered ? 0.18 : 0.11 + 0.018 * pulse);
    ctx.save();
    ctx.translate(v[0], v[1]);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    grad.addColorStop(0, hovered ? "rgba(255, 230, 140, 0.95)" : `rgba(255, 220, 120, ${0.55 + 0.25 * pulse})`);
    grad.addColorStop(0.6, hovered ? "rgba(255, 200, 90, 0.6)" : "rgba(255, 200, 90, 0.35)");
    grad.addColorStop(1, "rgba(255, 200, 90, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = hovered ? "rgba(255, 250, 220, 0.95)" : "rgba(255, 240, 200, 0.85)";
    ctx.lineWidth = s * (hovered ? 0.03 : 0.018);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Existing settlements that can be upgraded — cyan halo.
  for (const vk of hints.cities) {
    const v = graph.vertices.get(vk);
    if (!v) continue;
    const hovered = hints.hover?.kind === "vertex" && hints.hover.key === vk;
    const r = s * (hovered ? 0.32 : 0.24 + 0.02 * pulse);
    ctx.save();
    ctx.translate(v[0], v[1]);
    const grad = ctx.createRadialGradient(0, 0, r * 0.4, 0, 0, r);
    grad.addColorStop(0, "rgba(160, 220, 255, 0)");
    grad.addColorStop(0.7, hovered ? "rgba(160, 220, 255, 0.55)" : `rgba(160, 220, 255, ${0.25 + 0.15 * pulse})`);
    grad.addColorStop(1, "rgba(160, 220, 255, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Valid bridge edges — solid stroke whose opacity pulses gently.
  for (const ek of hints.edges) {
    const e = graph.edges.get(ek);
    if (!e) continue;
    const hovered = hints.hover?.kind === "edge" && hints.hover.key === ek;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineWidth = s * (hovered ? 0.11 : 0.07);
    const alpha = hovered ? 0.95 : 0.35 + 0.4 * pulse;
    ctx.strokeStyle = hovered
      ? "rgba(255, 240, 200, 0.95)"
      : `rgba(255, 220, 120, ${alpha})`;
    ctx.beginPath();
    ctx.moveTo(e.a[0], e.a[1]);
    ctx.lineTo(e.b[0], e.b[1]);
    ctx.stroke();
    ctx.restore();
  }

}
