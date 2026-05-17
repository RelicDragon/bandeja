import type { Prisma } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';
import { regularRoundSlotForPairIndices, teamIndicesForSig, type GroupSortedTeam } from './fixedTeamsRoundRobinFill';
import {
  assertDeletableBeforeDelete,
  isDeletableLeagueFixtureGame,
  matchupKeyFromFixedTeams,
  type LeagueFixtureGameGuardRow,
} from './leagueFixtureGame.util';

export type FixtureGamePlacementRow = LeagueFixtureGameGuardRow & {
  leagueRoundId: string | null;
  leagueGroupId: string | null;
  fixedTeams: {
    teamNumber: number;
    players: { userId: string | null }[];
  }[];
};

export function canDeleteFixtureGame(
  game: LeagueFixtureGameGuardRow,
  chatGameIds: Set<string>
): boolean {
  return isDeletableLeagueFixtureGame(game, {
    hasNonSystemChat: chatGameIds.has(game.id),
  });
}

/**
 * Move a non-deletable fixture into the REGULAR round that matches its RR slot.
 * Updates protectedByGroupKey (groupId → matchupKey → gameId).
 */
export async function placeProtectedFixtureInSchedule(
  tx: Prisma.TransactionClient,
  game: FixtureGamePlacementRow,
  params: {
    scheduleRounds: { id: string }[];
    sortedTeamsByGroupId: Map<string, GroupSortedTeam[]>;
    chatGameIds: Set<string>;
    protectedByGroupKey: Map<string, Map<string, string>>;
    scheduleRoundIds: Set<string>;
  }
): Promise<{ moved: boolean; deletedDuplicateId: string | null }> {
  const { scheduleRounds, sortedTeamsByGroupId, chatGameIds, protectedByGroupKey, scheduleRoundIds } =
    params;

  if (!game.leagueGroupId) {
    throw new ApiError(409, 'leagues.fullRoundRobin.recreate.invalidProtectedGame');
  }

  const matchupKey = matchupKeyFromFixedTeams(game.fixedTeams);
  if (!matchupKey) {
    throw new ApiError(409, 'leagues.fullRoundRobin.recreate.invalidProtectedGame');
  }

  const sortedTeams = sortedTeamsByGroupId.get(game.leagueGroupId);
  if (!sortedTeams) {
    throw new ApiError(409, 'leagues.fullRoundRobin.recreate.unknownTeamRoster');
  }

  const parts = matchupKey.split('|');
  const sigA = parts[0] ?? '';
  const sigB = parts[1] ?? '';
  const [ia, ib] = teamIndicesForSig(sortedTeams, sigA, sigB);
  const slot = regularRoundSlotForPairIndices(sortedTeams.length, ia, ib);
  const targetRound = scheduleRounds[slot];
  if (!targetRound) {
    throw new ApiError(409, 'leagues.fullRoundRobin.recreate.cannotPlaceProtectedGame');
  }

  let groupMap = protectedByGroupKey.get(game.leagueGroupId) ?? new Map<string, string>();
  const existingId = groupMap.get(matchupKey);
  let deletedDuplicateId: string | null = null;

  if (existingId && existingId !== game.id) {
    const existing = await tx.game.findUnique({
      where: { id: existingId },
      select: {
        id: true,
        leagueRoundId: true,
        resultsStatus: true,
        timeIsSet: true,
        clubId: true,
        courtId: true,
        _count: { select: { outcomes: true } },
      },
    });
    if (existing) {
      const existingGuard: LeagueFixtureGameGuardRow = {
        id: existing.id,
        resultsStatus: existing.resultsStatus,
        timeIsSet: existing.timeIsSet,
        clubId: existing.clubId,
        courtId: existing.courtId,
        hasOutcomes: existing._count.outcomes > 0,
      };
      if (scheduleRoundIds.has(existing.leagueRoundId ?? '')) {
        throw new ApiError(409, 'leagues.fullRoundRobin.recreate.duplicateProtectedMatchup');
      }
      if (canDeleteFixtureGame(existingGuard, chatGameIds)) {
        assertDeletableBeforeDelete(existingGuard);
        await tx.game.delete({ where: { id: existingId } });
        deletedDuplicateId = existingId;
        groupMap.delete(matchupKey);
      } else {
        throw new ApiError(409, 'leagues.fullRoundRobin.recreate.duplicateProtectedMatchup');
      }
    }
  }

  let moved = false;
  if (game.leagueRoundId !== targetRound.id) {
    await tx.game.update({
      where: { id: game.id },
      data: { leagueRoundId: targetRound.id },
    });
    moved = true;
  }

  groupMap.set(matchupKey, game.id);
  protectedByGroupKey.set(game.leagueGroupId, groupMap);

  return { moved, deletedDuplicateId };
}
