import { Board } from "../board";

// Dice roll overlay. Screen-space panel with two tumbling dice and the total.
export const DICE_ROLL_DURATION = 0.9;
export const DICE_SETTLE_DURATION = 0.5;
export const DICE_FADE_DURATION = 1.0; // seconds — panel fades out after settling, then dismisses

export type DiceState = {
  visible: boolean;
  startT: number;
  dice: [number, number];
  spin: [number, number];
  matchOrder: number[]; // tile indices whose number == sum, randomised
};
export const dice: DiceState = { visible: false, startT: 0, dice: [1, 1], spin: [0, 0], matchOrder: [] };

export const HIT_POP_DURATION = 0.7;
export const HIT_POP_STAGGER = 0.08;

export function rollDice(board: Board) {
  dice.visible = true;
  dice.startT = performance.now();
  dice.dice = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
  dice.spin = [
    (Math.random() < 0.5 ? -1 : 1) * (8 + Math.random() * 6),
    (Math.random() < 0.5 ? -1 : 1) * (8 + Math.random() * 6),
  ];
  const sum = dice.dice[0] + dice.dice[1];
  const matches = board.tiles
    .map((t, i) => (t.number === sum ? i : -1))
    .filter((i) => i >= 0);
  for (let i = matches.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [matches[i], matches[j]] = [matches[j], matches[i]];
  }
  dice.matchOrder = matches;
}

export function tileNumberPopScale(i: number, now: number): number {
  if (!dice.matchOrder.length) return 1;
  const rank = dice.matchOrder.indexOf(i);
  if (rank < 0) return 1;
  const popStartSec = dice.startT / 1000 + DICE_ROLL_DURATION + DICE_SETTLE_DURATION;
  const t = now / 1000 - popStartSec - rank * HIT_POP_STAGGER;
  if (t <= 0 || t >= HIT_POP_DURATION) return 1;
  // 1 → ~1.6 (peak around 0.5) → 1, with a small bounce on the way down
  const phase = t / HIT_POP_DURATION;
  const peak = 0.6 * Math.sin(phase * Math.PI);
  const wobble = 0.08 * Math.sin(phase * Math.PI * 3) * (1 - phase);
  return 1 + peak + wobble;
}

export function matchPopAnimationRunning(now: number) {
  if (!dice.matchOrder.length) return false;
  const popStartSec = dice.startT / 1000 + DICE_ROLL_DURATION + DICE_SETTLE_DURATION;
  const popEndSec = popStartSec + dice.matchOrder.length * HIT_POP_STAGGER + HIT_POP_DURATION;
  return now / 1000 < popEndSec + 0.05;
}

export function diceAnimationRunning(now: number) {
  if (!dice.visible) return false;
  const elapsed = (now - dice.startT) / 1000;
  if (elapsed > DICE_ROLL_DURATION + DICE_SETTLE_DURATION + DICE_FADE_DURATION) {
    dice.visible = false;
    return true; // one more frame so the panel clears
  }
  return true;
}
