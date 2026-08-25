/** Classic in-set TB games (6–6 then first to 7 games). */
const CLASSIC_GAMES_TIE_BREAK_HI = 7;
const CLASSIC_GAMES_TIE_BREAK_LO = 6;

export const TIE_BREAK_THRESHOLDS = [1, 5, 12, 32, 64] as const;

export type TieBreakSetScore = {
  teamAScore: number;
  teamBScore: number;
  isTieBreak: boolean;
};

/** Official set decided by tie-break: flagged super TB, or classic 7–6 games. */
export function isTieBreakSet(set: TieBreakSetScore): boolean {
  if (set.isTieBreak) {
    return set.teamAScore !== set.teamBScore;
  }
  const hi = Math.max(set.teamAScore, set.teamBScore);
  const lo = Math.min(set.teamAScore, set.teamBScore);
  return hi === CLASSIC_GAMES_TIE_BREAK_HI && lo === CLASSIC_GAMES_TIE_BREAK_LO;
}

/**
 * True when `teamNumber` (1 = A, 2 = B) won this set and it was a tie-break.
 */
export function userSideWonTieBreakSet(params: {
  teamNumber: number;
  set: TieBreakSetScore;
}): boolean {
  if (!isTieBreakSet(params.set)) return false;
  if (params.teamNumber === 1) return params.set.teamAScore > params.set.teamBScore;
  if (params.teamNumber === 2) return params.set.teamBScore > params.set.teamAScore;
  return false;
}
