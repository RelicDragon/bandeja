/** BWF-style game score ceiling (21→30, 15→21). Keep in sync with Backend/src/shared/strictValidation.ts */
export type BwfStrictValidationId = 'BWF_21' | 'BWF_15';

export function isBwfStrictValidation(id: string | null | undefined): id is BwfStrictValidationId {
  return id === 'BWF_21' || id === 'BWF_15';
}

export function bwfGameScoreCap(pointsPerGame: number): number {
  if (pointsPerGame === 21) return 30;
  if (pointsPerGame === 15) return 21;
  return pointsPerGame + 9;
}

export type RallyValidationOutcome =
  | { ok: true }
  | { ok: false; reason: 'DRAW_NOT_ALLOWED' | 'CLASSIC_SCORE_TOO_LOW_TO_WIN' | 'CLASSIC_NEEDS_WIN_BY_2' | 'CLASSIC_SCORE_TOO_HIGH' };

/** Rally game with BWF deuce cap (e.g. 29–29 → 30). */
export function validateBwfRallyGameScore(
  a: number,
  b: number,
  pointsPerGame: number,
  winBy = 2
): RallyValidationOutcome {
  if (a === b) return a === 0 ? { ok: true } : { ok: false, reason: 'DRAW_NOT_ALLOWED' };

  const target = pointsPerGame;
  const cap = bwfGameScoreCap(target);
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);

  if (hi > cap) return { ok: false, reason: 'CLASSIC_SCORE_TOO_HIGH' };
  if (hi === cap) return lo < hi ? { ok: true } : { ok: false, reason: 'DRAW_NOT_ALLOWED' };

  if (hi < target) return { ok: false, reason: 'CLASSIC_SCORE_TOO_LOW_TO_WIN' };
  if (hi === target && lo > target - winBy) {
    return { ok: false, reason: 'CLASSIC_NEEDS_WIN_BY_2' };
  }
  if (hi > target && hi - lo < winBy) {
    return { ok: false, reason: 'CLASSIC_NEEDS_WIN_BY_2' };
  }
  return { ok: true };
}

/** USAPA-style rally game to 11, win by 2 (not ball-budget). */
export function validatePickleballRally11Score(a: number, b: number): RallyValidationOutcome {
  const target = 11;
  const winBy = 2;
  if (a === b) return a === 0 ? { ok: true } : { ok: false, reason: 'DRAW_NOT_ALLOWED' };

  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  if (hi < target) return { ok: false, reason: 'CLASSIC_SCORE_TOO_LOW_TO_WIN' };
  if (hi === target && lo > target - winBy) {
    return { ok: false, reason: 'CLASSIC_NEEDS_WIN_BY_2' };
  }
  if (hi > target && hi - lo !== winBy) {
    return hi - lo < winBy
      ? { ok: false, reason: 'CLASSIC_NEEDS_WIN_BY_2' }
      : { ok: false, reason: 'CLASSIC_SCORE_TOO_HIGH' };
  }
  return { ok: true };
}
