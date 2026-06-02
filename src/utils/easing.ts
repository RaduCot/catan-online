// Bouncy ease — overshoots 1 then settles back. Used for the tail of card
// flips and the number-token pop-in.
export function easeOutBack(x: number): number {
  const c1 = 1.85;
  const c3 = c1 + 1;
  return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
}
