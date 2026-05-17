import { ResultsStatus } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';
import {
  isDeletableLeagueFixtureGame,
  matchupKeyFromFixedTeams,
  protectedFixturePriority,
  type LeagueFixtureGameGuardRow,
} from './leagueFixtureGame.util';

export type FixtureGameForDedup = LeagueFixtureGameGuardRow & {
  leagueRoundId: string | null;
  leagueGroupId: string | null;
  fixedTeams: {
    teamNumber: number;
    players: { userId: string | null }[];
  }[];
};

export type ResolveDuplicateProtectedResult = {
  deletableIds: string[];
  keepers: FixtureGameForDedup[];
  preservedDueToChat: number;
  preservedFinal: number;
  preservedInProgress: number;
  preservedScheduled: number;
};

export function resolveDuplicateProtectedFixtures(
  protectedGames: FixtureGameForDedup[],
  chatGameIds: Set<string>
): ResolveDuplicateProtectedResult {
  const deletableIds: string[] = [];
  const invalidProtected: FixtureGameForDedup[] = [];
  const byGroupKey = new Map<string, Map<string, FixtureGameForDedup[]>>();

  for (const game of protectedGames) {
    if (!game.leagueGroupId) {
      invalidProtected.push(game);
      continue;
    }
    const key = matchupKeyFromFixedTeams(game.fixedTeams);
    if (!key) {
      invalidProtected.push(game);
      continue;
    }
    let groupMap = byGroupKey.get(game.leagueGroupId);
    if (!groupMap) {
      groupMap = new Map();
      byGroupKey.set(game.leagueGroupId, groupMap);
    }
    const list = groupMap.get(key) ?? [];
    list.push(game);
    groupMap.set(key, list);
  }

  if (invalidProtected.length > 0) {
    throw new ApiError(409, 'leagues.fullRoundRobin.recreate.invalidProtectedGame');
  }

  const keepers: FixtureGameForDedup[] = [];
  let preservedDueToChat = 0;
  let preservedFinal = 0;
  let preservedInProgress = 0;
  let preservedScheduled = 0;

  const countPreserved = (game: FixtureGameForDedup) => {
    if (game.resultsStatus === ResultsStatus.FINAL) preservedFinal++;
    else if (game.resultsStatus === ResultsStatus.IN_PROGRESS) preservedInProgress++;
    else if (game.timeIsSet && game.clubId != null) preservedScheduled++;
    if (
      chatGameIds.has(game.id) &&
      isDeletableLeagueFixtureGame(game, { hasNonSystemChat: false })
    ) {
      preservedDueToChat++;
    }
  };

  for (const groupMap of byGroupKey.values()) {
    for (const games of groupMap.values()) {
      if (games.length === 1) {
        keepers.push(games[0]);
        countPreserved(games[0]);
        continue;
      }

      const ranked = [...games].sort((a, b) => {
        const diff =
          protectedFixturePriority(b, { hasNonSystemChat: chatGameIds.has(b.id) }) -
          protectedFixturePriority(a, { hasNonSystemChat: chatGameIds.has(a.id) });
        if (diff !== 0) return diff;
        return a.id.localeCompare(b.id);
      });

      const keeper = ranked[0];
      keepers.push(keeper);
      countPreserved(keeper);

      for (const loser of ranked.slice(1)) {
        if (isDeletableLeagueFixtureGame(loser, { hasNonSystemChat: chatGameIds.has(loser.id) })) {
          deletableIds.push(loser.id);
        } else {
          throw new ApiError(409, 'leagues.fullRoundRobin.recreate.duplicateProtectedMatchup');
        }
      }
    }
  }

  return {
    deletableIds,
    keepers,
    preservedDueToChat,
    preservedFinal,
    preservedInProgress,
    preservedScheduled,
  };
}
