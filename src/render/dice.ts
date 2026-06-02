import { easeOutBack } from "../utils/easing";
import { roundedRect } from "./primitives";
import {
  dice,
  DICE_ROLL_DURATION,
  DICE_SETTLE_DURATION,
  DICE_FADE_DURATION,
} from "../animation/dice";

export const DOT_PATTERNS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [[0.28, 0.28], [0.72, 0.72]],
  3: [[0.28, 0.28], [0.5, 0.5], [0.72, 0.72]],
  4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
  5: [[0.28, 0.28], [0.72, 0.28], [0.5, 0.5], [0.28, 0.72], [0.72, 0.72]],
  6: [[0.28, 0.22], [0.72, 0.22], [0.28, 0.5], [0.72, 0.5], [0.28, 0.78], [0.72, 0.78]],
};

export function drawDie(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, face: number, rotation: number, scale: number, highlight: boolean) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  ctx.scale(scale, scale);
  // Body
  const r = size * 0.18;
  roundedRect(ctx, -size / 2, -size / 2, size, size, r);
  // Drop shadow
  ctx.shadowColor = highlight ? "rgba(255,210,120,0.85)" : "rgba(0,0,0,0.6)";
  ctx.shadowBlur = highlight ? 24 : 14;
  ctx.shadowOffsetY = highlight ? 0 : 6;
  const grad = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
  grad.addColorStop(0, "#fcf7e8");
  grad.addColorStop(1, "#d9c8a3");
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.lineWidth = size * 0.05;
  ctx.strokeStyle = "#7a5a3e";
  ctx.stroke();
  // Dots
  ctx.fillStyle = "#3d2a1a";
  const dotR = size * 0.08;
  for (const [fx, fy] of DOT_PATTERNS[face]) {
    ctx.beginPath();
    ctx.arc(-size / 2 + fx * size, -size / 2 + fy * size, dotR, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawDice(ctx: CanvasRenderingContext2D, dpr: number, now: number) {
  if (!dice.visible) return;
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cssW = ctx.canvas.width / dpr;
  const cssH = ctx.canvas.height / dpr;

  const elapsed = (now - dice.startT) / 1000;
  const rolling = elapsed < DICE_ROLL_DURATION;
  const settleT = rolling ? 0 : Math.min(1, (elapsed - DICE_ROLL_DURATION) / DICE_SETTLE_DURATION);
  const fadeStart = DICE_ROLL_DURATION + DICE_SETTLE_DURATION;
  const fadeAlpha = elapsed < fadeStart ? 1 : Math.max(0, 1 - (elapsed - fadeStart) / DICE_FADE_DURATION);
  if (fadeAlpha <= 0) { ctx.restore(); return; }
  ctx.globalAlpha = fadeAlpha;

  // Large dice centered on the canvas, total below.
  const size = 160;
  const gap = 50;
  const cx = cssW / 2;
  const cy = cssH / 2 - 40;
  const leftX = cx - size / 2 - gap / 2;
  const rightX = cx + size / 2 + gap / 2;

  let d1 = dice.dice[0], d2 = dice.dice[1];
  let rot1 = 0, rot2 = 0, scale1 = 1, scale2 = 1;
  if (rolling) {
    const t = elapsed;
    d1 = 1 + Math.floor((t * 30) % 6);
    d2 = 1 + Math.floor((t * 30 + 3) % 6);
    rot1 = t * dice.spin[0];
    rot2 = t * dice.spin[1];
    scale1 = 1 + Math.sin(t * 18) * 0.08;
    scale2 = 1 + Math.cos(t * 18) * 0.08;
  } else {
    const e = easeOutBack(settleT);
    scale1 = scale2 = e;
  }
  drawDie(ctx, leftX, cy, size, d1, rot1, scale1, !rolling);
  drawDie(ctx, rightX, cy, size, d2, rot2, scale2, !rolling);

  // Total
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (!rolling) {
    const popScale = easeOutBack(settleT);
    ctx.translate(cx, cy + size / 2 + 80);
    ctx.scale(popScale, popScale);
    ctx.shadowColor = "rgba(0,0,0,0.65)";
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = "#ffd66b";
    ctx.font = "bold 90px system-ui, sans-serif";
    ctx.fillText(String(dice.dice[0] + dice.dice[1]), 0, 0);
  }
  ctx.restore();

  ctx.restore();
  void cssH; // referenced for completeness; cssH used implicitly via cy
}
