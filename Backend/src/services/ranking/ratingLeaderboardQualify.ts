import type { Sport } from '@prisma/client';

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

export function recentRatedParticipantWhere(sport: Sport, since: Date) {
  return {
    status: 'PLAYING' as const,
    game: {
      sport,
      resultsStatus: 'FINAL' as const,
      affectsRating: true,
      startTime: { gte: since },
    },
  };
}

export function selectRecentRatedUserIds(
  wantedUserIds: readonly string[],
  groupByRows: ReadonlyArray<{ userId: string }>,
): Set<string> {
  if (wantedUserIds.length === 0) return new Set();
  const wanted = new Set(wantedUserIds);
  const recent = new Set<string>();
  for (const row of groupByRows) {
    if (wanted.has(row.userId)) recent.add(row.userId);
  }
  return recent;
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
