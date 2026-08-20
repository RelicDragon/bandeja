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
