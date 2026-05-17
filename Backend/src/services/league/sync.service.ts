import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { USER_SELECT_FIELDS } from '../../utils/constants';
import { LeagueParticipantType, Prisma } from '@prisma/client';
import {
  ensureUserLeagueParticipant,
  findOrCreateLeagueTeamByRoster,
  findTeamParticipantByRoster,
  rostersEqual,
  sortedPlayerKey,
} from './leagueParticipantResolve';

type GameTeamWithPlayers = {
  players: { userId: string }[];
};

async function collectDesiredTeamPlayerIds(leagueSeasonId: string): Promise<string[][]> {
  const [seasonGame, roundGames] = await Promise.all([
    prisma.game.findUnique({
      where: { id: leagueSeasonId },
      include: {
        fixedTeams: {
          include: { players: true },
          orderBy: { teamNumber: 'asc' },
        },
      },
    }),
    prisma.game.findMany({
      where: {
        hasFixedTeams: true,
        leagueRound: { leagueSeasonId },
      },
      include: {
        fixedTeams: {
          include: { players: true },
          orderBy: { teamNumber: 'asc' },
        },
      },
    }),
  ]);

  /** Dedupes identical 2-player rosters; distinct pairs like [p1,p2] vs [p1,p3] stay separate keys. */
  const byKey = new Map<string, string[]>();

  const ingestFixedTeams = (fixedTeams: GameTeamWithPlayers[]) => {
    for (const ft of fixedTeams) {
      const ids = ft.players.map((p) => p.userId).sort();
      if (ids.length !== 2) continue;
      byKey.set(sortedPlayerKey(ids), ids);
    }
  };

  if (seasonGame?.hasFixedTeams) {
    ingestFixedTeams(seasonGame.fixedTeams);
  }
  for (const g of roundGames) {
    ingestFixedTeams(g.fixedTeams);
  }

  return [...byKey.values()].sort((a, b) => sortedPlayerKey(a).localeCompare(sortedPlayerKey(b)));
}

async function resolveLeagueGroupIdForTeam(
  tx: Prisma.TransactionClient,
  leagueSeasonId: string,
  teamPlayerIds: string[],
): Promise<string | null> {
  const key = sortedPlayerKey(teamPlayerIds);
  const games = await tx.game.findMany({
    where: {
      hasFixedTeams: true,
      leagueRound: { leagueSeasonId },
    },
    select: {
      leagueGroupId: true,
      fixedTeams: {
        select: {
          players: { select: { userId: true } },
        },
      },
    },
  });
  for (const g of games) {
    if (!g.leagueGroupId) continue;
    for (const ft of g.fixedTeams) {
      const ids = ft.players.map((p) => p.userId).sort();
      if (sortedPlayerKey(ids) === key) {
        return g.leagueGroupId;
      }
    }
  }
  return null;
}

export class LeagueSyncService {
  static async syncLeagueParticipants(leagueSeasonId: string) {
    const leagueSeason = await prisma.leagueSeason.findUnique({
      where: { id: leagueSeasonId },
      include: {
        game: true,
      },
    });

    if (!leagueSeason) {
      throw new ApiError(404, 'League season not found');
    }

    if (!leagueSeason.game) {
      throw new ApiError(404, 'League season game not found');
    }

    const seasonGame = await prisma.game.findUnique({
      where: { id: leagueSeasonId },
      include: {
        participants: {
          where: { status: 'PLAYING' },
          include: {
            user: {
              select: USER_SELECT_FIELDS,
            },
          },
        },
      },
    });

    if (!seasonGame) {
      throw new ApiError(404, 'League season game not found');
    }

    const leagueId = leagueSeason.leagueId;
    const desiredTeamPlayerIds = await collectDesiredTeamPlayerIds(leagueSeasonId);
    const useTeamPath = desiredTeamPlayerIds.length > 0;

    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${leagueSeasonId}::text))`);

      const standings = await tx.leagueParticipant.findMany({
        where: { leagueSeasonId },
        include: {
          user: {
            select: USER_SELECT_FIELDS,
          },
          leagueTeam: {
            include: {
              players: {
                include: {
                  user: {
                    select: USER_SELECT_FIELDS,
                  },
                },
              },
            },
          },
        },
      });

      if (useTeamPath) {
        const consumedParticipantIds = new Set<string>();

        for (const teamPlayerIds of desiredTeamPlayerIds) {
          let matchingLeagueTeam = null;
          let matchingStanding: (typeof standings)[number] | null = null;

          for (const standing of standings) {
            if (consumedParticipantIds.has(standing.id)) {
              continue;
            }
            if (standing.participantType !== LeagueParticipantType.TEAM || !standing.leagueTeam) {
              continue;
            }
            const standingPlayerIds = standing.leagueTeam.players.map((p) => p.userId);
            if (rostersEqual(teamPlayerIds, standingPlayerIds)) {
              matchingLeagueTeam = standing.leagueTeam;
              matchingStanding = standing;
              break;
            }
          }

          if (matchingStanding) {
            consumedParticipantIds.add(matchingStanding.id);
            const resolvedGroupId = await resolveLeagueGroupIdForTeam(tx, leagueSeasonId, teamPlayerIds);
            if (resolvedGroupId != null && matchingStanding.currentGroupId !== resolvedGroupId) {
              await tx.leagueParticipant.update({
                where: { id: matchingStanding.id },
                data: { currentGroupId: resolvedGroupId },
              });
            }
          }

          if (!matchingLeagueTeam) {
            const existingByRoster = await findTeamParticipantByRoster(tx, leagueSeasonId, teamPlayerIds);
            const resolvedGroupId = await resolveLeagueGroupIdForTeam(tx, leagueSeasonId, teamPlayerIds);

            if (existingByRoster) {
              consumedParticipantIds.add(existingByRoster.id);
              if (resolvedGroupId != null && existingByRoster.currentGroupId !== resolvedGroupId) {
                await tx.leagueParticipant.update({
                  where: { id: existingByRoster.id },
                  data: { currentGroupId: resolvedGroupId },
                });
              }
            } else {
              const leagueTeam = await findOrCreateLeagueTeamByRoster(tx, teamPlayerIds);
              await tx.leagueParticipant.create({
                data: {
                  leagueId,
                  leagueSeasonId,
                  participantType: LeagueParticipantType.TEAM,
                  leagueTeamId: leagueTeam.id,
                  currentGroupId: resolvedGroupId ?? undefined,
                  points: 0,
                  wins: 0,
                  ties: 0,
                  losses: 0,
                  scoreDelta: 0,
                },
              });
            }
          }
        }

        const staleTeamParticipants = standings.filter(
          (s) => s.participantType === LeagueParticipantType.TEAM && !consumedParticipantIds.has(s.id)
        );
        const staleLeagueTeamIds = staleTeamParticipants
          .map((s) => s.leagueTeamId)
          .filter((id): id is string => Boolean(id));

        if (staleTeamParticipants.length > 0) {
          await tx.leagueParticipant.deleteMany({
            where: { id: { in: staleTeamParticipants.map((s) => s.id) } },
          });
        }

        for (const teamId of staleLeagueTeamIds) {
          const refCount = await tx.leagueParticipant.count({ where: { leagueTeamId: teamId } });
          if (refCount === 0) {
            await tx.leagueTeam.delete({ where: { id: teamId } });
          }
        }

        await tx.leagueParticipant.deleteMany({
          where: {
            leagueSeasonId,
            participantType: LeagueParticipantType.USER,
          },
        });
      } else {
        const teamParticipantRows = await tx.leagueParticipant.findMany({
          where: { leagueSeasonId, participantType: LeagueParticipantType.TEAM },
          select: { leagueTeamId: true },
        });
        const teamIdsToMaybeDelete = [
          ...new Set(
            teamParticipantRows.map((s) => s.leagueTeamId).filter((id): id is string => Boolean(id))
          ),
        ];
        if (teamParticipantRows.length > 0) {
          await tx.leagueParticipant.deleteMany({
            where: { leagueSeasonId, participantType: LeagueParticipantType.TEAM },
          });
        }
        for (const teamId of teamIdsToMaybeDelete) {
          const refCount = await tx.leagueParticipant.count({ where: { leagueTeamId: teamId } });
          if (refCount === 0) {
            await tx.leagueTeam.delete({ where: { id: teamId } });
          }
        }

        const standingsUserIds = new Set(
          standings.filter((s) => s.userId).map((s) => s.userId!)
        );

        for (const participant of seasonGame.participants) {
          if (!standingsUserIds.has(participant.userId)) {
            await ensureUserLeagueParticipant(tx, {
              leagueId,
              leagueSeasonId,
              userId: participant.userId,
            });
          }
        }
      }

      return tx.leagueParticipant.findMany({
        where: { leagueSeasonId },
        include: {
          user: {
            select: USER_SELECT_FIELDS,
          },
          leagueTeam: {
            include: {
              players: {
                include: {
                  user: {
                    select: USER_SELECT_FIELDS,
                  },
                },
              },
            },
          },
        },
        orderBy: [{ points: 'desc' }, { wins: 'desc' }, { scoreDelta: 'desc' }],
      });
    });
  }
}
