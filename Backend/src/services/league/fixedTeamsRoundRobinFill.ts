import { EntityType, RoundType } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';
import type { GameReadinessDb } from '../game/readiness.service';
import { createLeagueGame } from './gameCreation.util';
import { pairIndicesForRoundRobinSlot, roundsInSingleRoundRobinCycle } from './generation/fixedTeamsRoundRobin';
import { matchupKeyFromSigs, teamPlayerSig } from './generation/fixedTeamsRoundMatching';
import { matchupKeyFromFixedTeams } from './leagueFixtureGame.util';

export interface GroupSortedTeam {
  participantId: string;
  playerIds: string[];
  sig: string;
}

export async function loadGroupSortedTeams(
  db: GameReadinessDb,
  leagueSeasonId: string,
  groupId: string
): Promise<GroupSortedTeam[]> {
  const participants = await db.leagueParticipant.findMany({
    where: { leagueSeasonId, currentGroupId: groupId },
    include: {
      leagueTeam: {
        include: {
          players: { select: { userId: true } },
        },
      },
    },
  });

  const entries = participants
    .filter((p) => p.participantType === 'TEAM' && p.leagueTeam?.players?.length)
    .map((p) => {
      const playerIds = Array.from(
        new Set(
          p.leagueTeam!.players
            .map((pl) => pl.userId)
            .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
        )
      );
      return { participantId: p.id, playerIds };
    })
    .filter((e) => e.playerIds.length === 2);

  if (entries.length !== participants.length) {
    throw new ApiError(400, 'leagues.fullRoundRobin.invalidTeamParticipants');
  }

  return entries
    .sort((a, b) => a.participantId.localeCompare(b.participantId))
    .map((e) => ({
      ...e,
      sig: teamPlayerSig(e.playerIds),
    }));
}

export function regularRoundSlotForPairIndices(
  teamCount: number,
  indexA: number,
  indexB: number
): number {
  const cycle = roundsInSingleRoundRobinCycle(teamCount);
  for (let slot = 0; slot < cycle; slot++) {
    for (const [a, b] of pairIndicesForRoundRobinSlot(teamCount, slot)) {
      if ((a === indexA && b === indexB) || (a === indexB && b === indexA)) {
        return slot;
      }
    }
  }
  throw new ApiError(500, 'leagues.fullRoundRobin.recreate.pairingNotInSchedule');
}

export function teamIndicesForSig(sortedTeams: GroupSortedTeam[], sigA: string, sigB: string): [number, number] {
  const ia = sortedTeams.findIndex((t) => t.sig === sigA);
  const ib = sortedTeams.findIndex((t) => t.sig === sigB);
  if (ia < 0 || ib < 0) {
    throw new ApiError(400, 'leagues.fullRoundRobin.recreate.unknownTeamRoster');
  }
  return [ia, ib];
}

export async function ensureFixedTeamPairingsForRegularRound(
  db: GameReadinessDb,
  params: {
    leagueRoundId: string;
    leagueRoundOrderIndex: number;
    leagueSeasonId: string;
    groupId: string;
    seasonGame: { allowUserInMultipleTeams: boolean };
    sortedTeams: GroupSortedTeam[];
  }
): Promise<number> {
  const { leagueRoundId, leagueRoundOrderIndex, leagueSeasonId, groupId, seasonGame, sortedTeams } =
    params;

  if (sortedTeams.length < 2) return 0;

  const priorRegularRounds = await db.leagueRound.count({
    where: {
      leagueSeasonId,
      roundType: RoundType.REGULAR,
      orderIndex: { lt: leagueRoundOrderIndex },
    },
  });

  const cycle = roundsInSingleRoundRobinCycle(sortedTeams.length);
  if (cycle < 1) return 0;

  const slot = priorRegularRounds % cycle;
  const pairIndices = pairIndicesForRoundRobinSlot(sortedTeams.length, slot);

  const existingGames = await db.game.findMany({
    where: {
      leagueRoundId,
      leagueGroupId: groupId,
      entityType: EntityType.LEAGUE,
    },
    include: {
      fixedTeams: {
        orderBy: { teamNumber: 'asc' },
        include: { players: { select: { userId: true } } },
      },
    },
  });

  const existingKeys = new Set<string>();
  for (const g of existingGames) {
    const key = matchupKeyFromFixedTeams(g.fixedTeams);
    if (key) existingKeys.add(key);
  }

  let created = 0;
  for (const [ia, ib] of pairIndices) {
    const team1 = sortedTeams[ia];
    const team2 = sortedTeams[ib];
    if (!team1 || !team2) {
      throw new ApiError(500, 'Pairing produced invalid team indices');
    }
    const key = matchupKeyFromSigs(team1.sig, team2.sig);
    if (existingKeys.has(key)) continue;

    await createLeagueGame({
      leagueRoundId,
      seasonGame,
      leagueSeasonId,
      team1PlayerIds: team1.playerIds,
      team2PlayerIds: team2.playerIds,
      leagueGroupId: groupId,
      isPublic: false,
      affectsRating: true,
      db,
    });
    existingKeys.add(key);
    created++;
  }

  return created;
}
