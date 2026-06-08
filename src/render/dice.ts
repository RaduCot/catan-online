import { easeOutBack } from "../utils/easing";
import { roundedRect } from "./primitives";
import {
  dice,
  DICE_ROLL_DURATION,
  DICE_SETTLE_DURATION,
  DICE_HOLD_DURATION,
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

  // On a landed die, paint a soft radial aura behind the body before the
  // body itself — gives a warm "this is the result" glow that the canvas
  // shadow alone can't sell at small blur values.
  if (highlight) {
    const auraR = size * 1.05;
    const aura = ctx.createRadialGradient(0, 0, size * 0.42, 0, 0, auraR);
    aura.addColorStop(0, "rgba(255, 215, 110, 0.7)");
    aura.addColorStop(0.55, "rgba(255, 200, 90, 0.32)");
    aura.addColorStop(1, "rgba(255, 200, 90, 0)");
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(0, 0, auraR, 0, Math.PI * 2);
    ctx.fill();
  }

  // Body
  const r = size * 0.18;
  roundedRect(ctx, -size / 2, -size / 2, size, size, r);
  // Drop shadow — stronger gold on the landed die.
  ctx.shadowColor = highlight ? "rgba(255, 215, 110, 1)" : "rgba(0,0,0,0.6)";
  ctx.shadowBlur = highlight ? 36 : 14;
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
  // After settling, hold the landed pose for DICE_HOLD_DURATION before the
  // fade kicks in, so the player can read the result.
  const fadeStart = DICE_ROLL_DURATION + DICE_SETTLE_DURATION + DICE_HOLD_DURATION;
  const fadeAlpha = elapsed < fadeStart ? 1 : Math.max(0, 1 - (elapsed - fadeStart) / DICE_FADE_DURATION);
  if (fadeAlpha <= 0) { ctx.restore(); return; }
  ctx.globalAlpha = fadeAlpha;

  // Soft dark radial backdrop behind the dice. Smoothstepped intro so it
  // doesn't pop in; it inherits the fade-out via globalAlpha = fadeAlpha.
  {
    const introU = Math.min(1, elapsed / 0.3);
    const introE = introU * introU * (3 - 2 * introU);
    if (introE > 0) {
      const r = Math.max(ctx.canvas.width / dpr, ctx.canvas.height / dpr) * 0.55;
      const grad = ctx.createRadialGradient(cssW / 2, cssH / 2 - 40, 0, cssW / 2, cssH / 2 - 40, r);
      grad.addColorStop(0, `rgba(0, 0, 0, ${0.62 * introE})`);
      grad.addColorStop(0.45, `rgba(0, 0, 0, ${0.32 * introE})`);
      grad.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, cssW, cssH);
    }
  }

  // Large dice centered on the canvas, total below. The two dice drift
  // further apart as they settle so the rotated landed pose doesn't overlap.
  const size = 160;
  const baseGap = 70;
  const spreadOnLand = 36; // extra spacing applied via settleT
  const cx = cssW / 2;
  const cy = cssH / 2 - 40;
  // Bouncy spread: easeOutBack overshoots past spreadOnLand then settles
  // back, so the dice get a satisfying "spring apart" pop on landing.
  const spread = rolling ? 0 : easeOutBack(Math.min(1, settleT)) * spreadOnLand;
  const leftX = cx - size / 2 - baseGap / 2 - spread;
  const rightX = cx + size / 2 + baseGap / 2 + spread;

  // Scale targets — dice grow gradually during the roll to a small "ready"
  // size, then bounce up to the landed size with overshoot.
  const ROLL_END_SCALE = 1.08;
  const LAND_SCALE = 1.22;

  let d1 = dice.dice[0], d2 = dice.dice[1];
  let rot1 = 0, rot2 = 0, scale1 = 1, scale2 = 1;
  if (rolling) {
    // Ease-in-out cadence on faces: ticks accumulate slowly at the start,
    // fast in the middle, slow toward the end via smoothstep. The dice also
    // scale up gradually along the same smoothstep curve so the motion has
    // a single coherent acceleration arc.
    const u = elapsed / DICE_ROLL_DURATION;
    const eased = u * u * (3 - 2 * u); // smoothstep, 0→1
    const TOTAL_TICKS = 18;
    const ticks = eased * TOTAL_TICKS;
    const tickIdx = Math.floor(ticks);
    d1 = 1 + ((tickIdx * 5 + 2) % 6);
    d2 = 1 + ((tickIdx * 3 + 5) % 6);
    scale1 = scale2 = 1 + (ROLL_END_SCALE - 1) * eased;
  } else {
    // Land: scale springs from the roll-end size to the larger landed size
    // with easeOutBack so it overshoots and settles. Rotation uses the same
    // easing so the tilt also bounces past ±15° before settling.
    const e = easeOutBack(Math.min(1, settleT));
    scale1 = scale2 = ROLL_END_SCALE + (LAND_SCALE - ROLL_END_SCALE) * e;
    const rotRad = (15 * Math.PI) / 180;
    rot1 = -rotRad * e;
    rot2 = +rotRad * e;
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
