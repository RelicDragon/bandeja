export const RATING_LEADERBOARD_MUTED_TEXT = 'text-gray-400 dark:text-gray-500';

export function isRatingLeaderboardGrayed(
  leaderboardType: 'level' | 'social',
  inactive: boolean | undefined,
): boolean {
  return leaderboardType === 'level' && inactive === true;
}

export function firstInactiveRatingRowId(
  leaderboardType: 'level' | 'social',
  entries: ReadonlyArray<{ id: string; inactive?: boolean }>,
): string | undefined {
  if (leaderboardType !== 'level') return undefined;
  return entries.find((entry) => entry.inactive === true)?.id;
}

export function ratingLeaderboardRankLabel(
  leaderboardType: 'level' | 'social',
  rank: number | null | undefined,
  inactive: boolean | undefined,
  unrankedLabel: string,
): string {
  if (isRatingLeaderboardGrayed(leaderboardType, inactive)) {
    return unrankedLabel;
  }
  return rank == null ? '' : String(rank);
}

export function ratingLeaderboardDeltaClass(
  change: number,
  isGrayed: boolean,
): string {
  const base = 'rounded px-1 py-0.5 text-[10px] font-medium tabular-nums';
  if (isGrayed) {
    return `${base} bg-gray-100 ${RATING_LEADERBOARD_MUTED_TEXT} dark:bg-gray-800`;
  }
  if (change > 0) {
    return `${base} bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400`;
  }
  if (change < 0) {
    return `${base} bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400`;
  }
  return `${base} bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-400`;
}
