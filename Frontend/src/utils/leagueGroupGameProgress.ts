import type { LeagueRound } from '@/api/leagues';
import { userIsOnLeagueScheduleGame } from '@/utils/leagueScheduleUserGames';

export type LeagueGroupGameProgressRow = {
  groupId: string;
  finished: number;
  total: number;
};

export function leagueGroupGameProgressFromRounds(
  rounds: LeagueRound[],
  groupIds: string[]
): LeagueGroupGameProgressRow[] {
  const groupIdSet = new Set(groupIds);
  const counts = new Map<string, { finished: number; total: number }>();
  for (const id of groupIds) {
    counts.set(id, { finished: 0, total: 0 });
  }

  for (const round of rounds) {
    for (const game of round.games) {
      const groupId = game.leagueGroupId;
      if (!groupId || !groupIdSet.has(groupId)) continue;
      const row = counts.get(groupId)!;
      row.total += 1;
      if (game.resultsStatus === 'FINAL') row.finished += 1;
    }
  }

  return groupIds.map((groupId) => {
    const row = counts.get(groupId)!;
    return { groupId, finished: row.finished, total: row.total };
  });
}

export function leagueGroupUserGameProgressFromRounds(
  rounds: LeagueRound[],
  groupIds: string[],
  userId: string
): LeagueGroupGameProgressRow[] {
  const groupIdSet = new Set(groupIds);
  const counts = new Map<string, { finished: number; total: number }>();
  for (const id of groupIds) {
    counts.set(id, { finished: 0, total: 0 });
  }

  for (const round of rounds) {
    for (const game of round.games) {
      const groupId = game.leagueGroupId;
      if (!groupId || !groupIdSet.has(groupId)) continue;
      if (!userIsOnLeagueScheduleGame(game, userId)) continue;
      const row = counts.get(groupId)!;
      row.total += 1;
      if (game.resultsStatus === 'FINAL') row.finished += 1;
    }
  }

  return groupIds.map((groupId) => {
    const row = counts.get(groupId)!;
    return { groupId, finished: row.finished, total: row.total };
  });
}
