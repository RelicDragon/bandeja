/**
 * A game's level band is user intent picked on a 0.1-step slider, not a
 * computed rating — so it must never carry a player's full-precision level.
 *
 * Seeding a band from `user.level` (host ± 0.7, or widening to roster levels)
 * leaks the raw float into `Game.minLevel`/`maxLevel`, where it is both shown
 * ("level 2.045097134590984–3.445097134590984") and *enforced* by the
 * availability filters — so a player at 2.03 is silently excluded from a game
 * advertised as 2.0+. Snapping here keeps display and matching in agreement.
 *
 * Only for bands. Ratings themselves (`UserSportProfile.level`, outcome
 * `levelBefore`/`levelAfter`) stay full precision and are rounded at render.
 */
export const LEVEL_BAND_STEP = 0.1;

/** Snap to a fractional grid, without binary float dust flipping a tie. */
export function snapToStep(value: number, step: number): number {
  if (!Number.isFinite(value) || !(step > 0)) return value;
  // `value / step` can land a hair under an exact .5 — 2.05 / 0.1 is
  // 20.499999999999996 — which would round a tie down. Normalise the quotient
  // first so ties always go up, whatever the operands look like in binary.
  const steps = Math.round(Number((value / step).toFixed(9)));
  return Number((steps * step).toFixed(6));
}

/** Snap a band edge to the 0.1 grid. */
export function roundLevelBandValue(value: number): number {
  return snapToStep(value, LEVEL_BAND_STEP);
}

/** Snap both edges of a band. */
export function roundLevelBand(band: [number, number]): [number, number] {
  return [roundLevelBandValue(band[0]), roundLevelBandValue(band[1])];
}
