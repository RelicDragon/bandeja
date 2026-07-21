import type { Game } from '@/types';
import { userIsOnLeagueScheduleGame } from '@/utils/leagueScheduleUserGames';

export function distinctLeagueGroupIdsForUser(
  games: Iterable<Game>,
  userId: string | undefined,
): string[] {
  if (!userId) return [];
  const ids = new Set<string>();
  for (const game of games) {
    if (!userIsOnLeagueScheduleGame(game, userId)) continue;
    const groupId = game.leagueGroupId ?? game.leagueGroup?.id;
    if (groupId) ids.add(groupId);
  }
  return [...ids];
}

export function userPlaysInMultipleLeagueGroups(
  games: Iterable<Game>,
  userId: string | undefined,
): boolean {
  return distinctLeagueGroupIdsForUser(games, userId).length > 1;
}
