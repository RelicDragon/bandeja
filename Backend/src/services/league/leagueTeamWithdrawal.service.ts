import {
  EntityType,
  LeagueParticipantType,
  Prisma,
  ResultsStatus,
  RoundType,
} from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { LEAGUE_USER_SELECT, projectLeagueParticipants } from './leagueSportProjection.util';
import { loadLeagueSeasonSportOrThrow } from '../../utils/validators/validateLeagueSeasonSport';
import { findTeamParticipantByRoster, sortedPlayerKey } from './leagueParticipantResolve';
import { loadSeasonRosterAliasMap } from './leagueTeamRosterAlias.util';
import { finalizeNeutralTechnicalFixture } from './leagueNeutralTechnicalResult';
import { LeagueStandingsRecalculateService } from './leagueStandingsRecalculate.service';

export type WithdrawLeagueTeamParams = {
  leagueSeasonId: string;
  participantId: string;
  actorUserId: string;
};

async function resolveFixtureParticipantIds(
  tx: Prisma.TransactionClient,
  leagueSeasonId: string,
  fixedTeams: { players: { userId: string | null }[] }[]
): Promise<string[]> {
  const ids: string[] = [];
  for (const team of fixedTeams) {
    const playerIds = team.players
      .map((p) => p.userId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    const participant = await findTeamParticipantByRoster(tx, leagueSeasonId, playerIds);
    if (participant?.id) ids.push(participant.id);
  }
  return ids;
}

function fixtureInvolvesFranchise(params: {
  fixedTeams: { players: { userId: string | null }[] }[];
  franchiseTeamId: string;
  franchisePlayerIds: Set<string>;
  aliasMap: Map<string, string>;
}): boolean {
  const { fixedTeams, franchiseTeamId, franchisePlayerIds, aliasMap } = params;
  for (const team of fixedTeams) {
    const playerIds = team.players
      .map((p) => p.userId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    if (playerIds.some((id) => franchisePlayerIds.has(id))) return true;
    const key = sortedPlayerKey(playerIds);
    if (key && aliasMap.get(key) === franchiseTeamId) return true;
  }
  return false;
}

export class LeagueTeamWithdrawalService {
  static async withdrawTeam(params: WithdrawLeagueTeamParams) {
    const { leagueSeasonId, participantId, actorUserId } = params;
    const seasonSport = await loadLeagueSeasonSportOrThrow(leagueSeasonId);

    const result = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${leagueSeasonId}::text))`
        );

        const seasonGame = await tx.game.findUnique({
          where: { id: leagueSeasonId },
          select: {
            id: true,
            hasFixedTeams: true,
            entityType: true,
          },
        });

        if (!seasonGame || seasonGame.entityType !== EntityType.LEAGUE_SEASON) {
          throw new ApiError(404, 'League season not found');
        }
        if (!seasonGame.hasFixedTeams) {
          throw new ApiError(400, 'Team withdrawal requires fixed teams');
        }

        const participant = await tx.leagueParticipant.findFirst({
          where: {
            id: participantId,
            leagueSeasonId,
            participantType: LeagueParticipantType.TEAM,
          },
          include: {
            leagueTeam: {
              include: {
                players: {
                  include: {
                    user: { select: LEAGUE_USER_SELECT },
                  },
                },
              },
            },
            currentGroup: {
              select: {
                id: true,
                name: true,
                betterGroupId: true,
                worseGroupId: true,
                color: true,
              },
            },
          },
        });

        if (!participant?.leagueTeam) {
          throw new ApiError(404, 'Fixed team not found');
        }
        if (participant.withdrawnAt) {
          throw new ApiError(409, 'Team is already withdrawn');
        }

        const franchiseTeamId = participant.leagueTeamId!;
        const franchisePlayerIds = new Set(participant.leagueTeam.players.map((p) => p.userId));
        const aliasMap = await loadSeasonRosterAliasMap(tx, leagueSeasonId);

        const unfinished = await tx.game.findMany({
          where: {
            entityType: EntityType.LEAGUE,
            parentId: leagueSeasonId,
            leagueRoundId: { not: null },
            leagueGroupId: { not: null },
            resultsStatus: { not: ResultsStatus.FINAL },
            leagueRound: {
              leagueSeasonId,
              roundType: RoundType.REGULAR,
            },
          },
          include: {
            fixedTeams: {
              include: { players: true },
              orderBy: { teamNumber: 'asc' },
            },
          },
        });

        const finalizedGameIds: string[] = [];
        for (const game of unfinished) {
          const involves = fixtureInvolvesFranchise({
            fixedTeams: game.fixedTeams,
            franchiseTeamId,
            franchisePlayerIds,
            aliasMap,
          });
          if (!involves) continue;

          const sideIds = await resolveFixtureParticipantIds(
            tx,
            leagueSeasonId,
            game.fixedTeams
          );
          if (!sideIds.includes(participantId) || sideIds.length < 2) {
            throw new ApiError(
              400,
              'Cannot withdraw: unfinished fixture involving this team could not be settled'
            );
          }
          const winnerId = sideIds.find((id) => id !== participantId);
          if (!winnerId) {
            throw new ApiError(400, 'Cannot withdraw: no opponent for technical win');
          }
          await finalizeNeutralTechnicalFixture(game.id, winnerId, tx);
          finalizedGameIds.push(game.id);
        }

        const updated = await tx.leagueParticipant.update({
          where: { id: participantId },
          data: { withdrawnAt: new Date() },
          include: {
            leagueTeam: {
              include: {
                players: {
                  include: {
                    user: { select: LEAGUE_USER_SELECT },
                  },
                },
              },
            },
            currentGroup: {
              select: {
                id: true,
                name: true,
                betterGroupId: true,
                worseGroupId: true,
                color: true,
              },
            },
            user: { select: LEAGUE_USER_SELECT },
          },
        });

        await LeagueStandingsRecalculateService.recalculateFromPlayedGames(leagueSeasonId, tx);

        const refreshed = await tx.leagueParticipant.findUnique({
          where: { id: participantId },
          include: {
            leagueTeam: {
              include: {
                players: {
                  include: {
                    user: { select: LEAGUE_USER_SELECT },
                  },
                },
              },
            },
            currentGroup: {
              select: {
                id: true,
                name: true,
                betterGroupId: true,
                worseGroupId: true,
                color: true,
              },
            },
            user: { select: LEAGUE_USER_SELECT },
          },
        });

        return {
          participant: refreshed ?? updated,
          technicalFixtures: finalizedGameIds.length,
          finalizedGameIds,
        };
      },
      { timeout: 60_000 }
    );

    const socketService = (
      global as {
        socketService?: {
          emitGameUpdate: (id: string, senderId: string) => Promise<void> | void;
        };
      }
    ).socketService;
    if (socketService) {
      for (const gameId of result.finalizedGameIds) {
        try {
          await socketService.emitGameUpdate(gameId, actorUserId);
        } catch {
          /* best-effort */
        }
      }
      try {
        await socketService.emitGameUpdate(leagueSeasonId, actorUserId);
      } catch {
        /* best-effort */
      }
    }

    return {
      participant: projectLeagueParticipants([result.participant], seasonSport)[0],
      technicalFixtures: result.technicalFixtures,
    };
  }
}
