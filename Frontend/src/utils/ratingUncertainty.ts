/** Matches Backend `ratingUncertaintyScale`: 0→1, 100→2, 150→3. */
export function ratingUncertaintyScale(uncertainty: number): number {
  const u = Math.max(0, Math.min(150, uncertainty));
  if (u <= 100) return 1 + u / 100;
  return 2 + (u - 100) / 50;
}
