const MS_PER_DAY = 86_400_000;

export const RATING_UNCERTAINTY_MAX = 150;
/** Days after last rating activity with zero idle accrual. */
export const RATING_UNCERTAINTY_GRACE_DAYS = 30;
/** After grace: +IDLE_STEP uncertainty per this many post-grace days (continuous). */
export const RATING_UNCERTAINTY_IDLE_DAYS = 30;
export const RATING_UNCERTAINTY_IDLE_STEP = 10;
export const RATING_UNCERTAINTY_PLAY_STEP = 10;

export function clampRatingUncertainty(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(RATING_UNCERTAINTY_MAX, value));
}

/** Maps uncertainty → scale on reliability coefficient: 0→1, 100→2, 150→3. */
export function ratingUncertaintyScale(uncertainty: number): number {
  const u = clampRatingUncertainty(uncertainty);
  if (u <= 100) return 1 + u / 100;
  return 2 + (u - 100) / 50;
}

/** Idle days past the grace window (0 during grace / missing activity). */
export function ratingPostGraceDays(
  lastRatingActivityAt: Date | null | undefined,
  now: Date = new Date(),
): number {
  if (!lastRatingActivityAt) return 0;
  const idleDays = Math.max(
    0,
    (now.getTime() - lastRatingActivityAt.getTime()) / MS_PER_DAY,
  );
  return Math.max(0, idleDays - RATING_UNCERTAINTY_GRACE_DAYS);
}

/** Soft public “settling” when idle past grace (rise can start). */
export function isRatingSettling(
  lastRatingActivityAt: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  return ratingPostGraceDays(lastRatingActivityAt, now) > 0;
}

/**
 * Continuous idle accrual with grace:
 * - no lastRatingActivityAt (never played) → always 0 (ignore any stored value)
 * - first GRACE_DAYS after lastRatingActivityAt → no rise
 * - then +(postGraceDays / IDLE_DAYS) * IDLE_STEP onto stored value, capped at MAX
 */
export function accrueRatingUncertainty(
  current: number,
  lastRatingActivityAt: Date | null | undefined,
  now: Date = new Date(),
): number {
  if (!lastRatingActivityAt) return 0;
  const base = clampRatingUncertainty(current);
  const postGraceDays = ratingPostGraceDays(lastRatingActivityAt, now);
  if (postGraceDays <= 0) return base;
  const idleContribution =
    (postGraceDays / RATING_UNCERTAINTY_IDLE_DAYS) * RATING_UNCERTAINTY_IDLE_STEP;
  return clampRatingUncertainty(base + idleContribution);
}

/** After one finished rating-affecting competitive game (not training). */
export function ratingUncertaintyAfterFinishedGame(accrued: number): number {
  return clampRatingUncertainty(accrued - RATING_UNCERTAINTY_PLAY_STEP);
}

export function computeBaseReliabilityCoefficient(reliability: number): number {
  const clampedReliability = Math.max(0.0, Math.min(100.0, reliability));
  return Math.max(0.1, Math.exp(-0.108 * Math.pow(clampedReliability, 0.68)));
}

export function computeReliabilityCoefficient(
  reliability: number,
  ratingUncertainty: number = 0,
): number {
  return computeBaseReliabilityCoefficient(reliability) * ratingUncertaintyScale(ratingUncertainty);
}
