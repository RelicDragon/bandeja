export const RATING_LEADERBOARD_MIN_GAMES = 5;
export const RATING_LEADERBOARD_ACTIVITY_DAYS = 90;

export type RatingLeaderboardSortKey = {
  id: string;
  level: number;
  reliability: number;
  gamesWon: number;
};

export type RatingLeaderboardQualifyInput = {
  gamesPlayed: number;
  hasRecentRatedGame: boolean;
};

export function ratingLeaderboardActivitySince(nowMs = Date.now()): Date {
  return new Date(nowMs - RATING_LEADERBOARD_ACTIVITY_DAYS * 24 * 60 * 60 * 1000);
}

export function qualifiesForRatingRank(input: RatingLeaderboardQualifyInput): boolean {
  return input.gamesPlayed >= RATING_LEADERBOARD_MIN_GAMES && input.hasRecentRatedGame;
}

export function compareRatingLeaderboardEntries(
  a: RatingLeaderboardSortKey,
  b: RatingLeaderboardSortKey,
): number {
  if (a.level !== b.level) return b.level - a.level;
  if (a.reliability !== b.reliability) return b.reliability - a.reliability;
  if (a.gamesWon !== b.gamesWon) return b.gamesWon - a.gamesWon;
  return a.id.localeCompare(b.id);
}

export function orderPlayedRatingLeaderboard<T extends RatingLeaderboardSortKey>(users: T[]): T[] {
  return [...users].sort(compareRatingLeaderboardEntries);
}

export function orderRatingLeaderboard<T extends RatingLeaderboardSortKey & { qualifiesForRating: boolean }>(
  users: T[],
): T[] {
  const qualifying = users.filter((user) => user.qualifiesForRating).sort(compareRatingLeaderboardEntries);
  const rest = users.filter((user) => !user.qualifiesForRating).sort(compareRatingLeaderboardEntries);
  return [...qualifying, ...rest];
}
