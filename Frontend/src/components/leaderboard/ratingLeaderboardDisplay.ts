export function isRatingLeaderboardGrayed(
  leaderboardType: 'level' | 'social',
  qualifiesForRating: boolean | undefined,
): boolean {
  return leaderboardType === 'level' && qualifiesForRating === false;
}

export function ratingLeaderboardRankLabel(
  leaderboardType: 'level' | 'social',
  rank: number | null | undefined,
  qualifiesForRating: boolean | undefined,
  unrankedLabel: string,
): string {
  if (isRatingLeaderboardGrayed(leaderboardType, qualifiesForRating)) {
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
    return `${base} bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500`;
  }
  if (change > 0) {
    return `${base} bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400`;
  }
  if (change < 0) {
    return `${base} bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400`;
  }
  return `${base} bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-400`;
}
