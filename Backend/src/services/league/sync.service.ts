import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { USER_SELECT_FIELDS } from '../../utils/constants';

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
          where: { isPlaying: true },
          include: {
            user: {
              select: USER_SELECT_FIELDS,
            },
          },
        },
        fixedTeams: {
          include: {
            players: {
              include: {
                user: {
                  select: USER_SELECT_FIELDS,
                },
              },
            },
          },
          orderBy: { teamNumber: 'asc' },
        },
      },
    });

    if (!seasonGame) {
      throw new ApiError(404, 'League season game not found');
    }

    const hasFixedTeams = seasonGame.hasFixedTeams || false;
    const leagueId = leagueSeason.leagueId;

    const standings = await prisma.leagueParticipant.findMany({
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

    if (hasFixedTeams) {
      const allGameTeamPlayerIds = new Set<string>();
      seasonGame.fixedTeams.forEach(team => {
        team.players.forEach(player => {
          allGameTeamPlayerIds.add(player.userId);
        });
      });

      const standingsPlayerIds = new Set<string>();
      standings.forEach(standing => {
        if (standing.leagueTeam) {
          standing.leagueTeam.players.forEach(p => standingsPlayerIds.add(p.userId));
        }
      });

      for (const fixedTeam of seasonGame.fixedTeams) {
        const teamPlayerIds = fixedTeam.players.map(p => p.userId).sort();
        let matchingLeagueTeam = null;

        for (const standing of standings) {
          if (standing.leagueTeam) {
            const standingPlayerIds = standing.leagueTeam.players.map(p => p.userId).sort();
            if (teamPlayerIds.length === standingPlayerIds.length &&
                teamPlayerIds.every((id, idx) => id === standingPlayerIds[idx])) {
              matchingLeagueTeam = standing.leagueTeam;
              break;
            }
          }
        }

        if (!matchingLeagueTeam) {
          const newLeagueTeam = await prisma.leagueTeam.create({
            data: {
              players: {
                create: teamPlayerIds.map(userId => ({
                  userId,
                })),
              },
            },
          });

          const existingTeamParticipant = await prisma.leagueParticipant.findFirst({
            where: {
              leagueSeasonId,
              leagueTeamId: newLeagueTeam.id,
              participantType: 'TEAM',
            },
          });

          if (!existingTeamParticipant) {
            await prisma.leagueParticipant.create({
              data: {
                leagueId,
                leagueSeasonId,
                participantType: 'TEAM',
                leagueTeamId: newLeagueTeam.id,
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

      for (const playerId of allGameTeamPlayerIds) {
        if (!standingsPlayerIds.has(playerId)) {
          const existingParticipant = await prisma.leagueParticipant.findFirst({
            where: {
              leagueSeasonId,
              userId: playerId,
              participantType: 'USER',
            },
          });
          if (!existingParticipant) {
            await prisma.leagueParticipant.create({
              data: {
                leagueId,
                leagueSeasonId,
                participantType: 'USER',
                userId: playerId,
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
    } else {
      const standingsUserIds = new Set(
        standings
          .filter(s => s.userId)
          .map(s => s.userId!)
      );

      for (const participant of seasonGame.participants) {
        if (!standingsUserIds.has(participant.userId)) {
          const existingParticipant = await prisma.leagueParticipant.findFirst({
            where: {
              leagueSeasonId,
              userId: participant.userId,
              participantType: 'USER',
            },
          });
          if (!existingParticipant) {
            await prisma.leagueParticipant.create({
              data: {
                leagueId,
                leagueSeasonId,
                participantType: 'USER',
                userId: participant.userId,
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
    }

    const updatedStandings = await prisma.leagueParticipant.findMany({
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
      orderBy: [
        { points: 'desc' },
        { wins: 'desc' },
        { scoreDelta: 'desc' },
      ],
    });

    return updatedStandings;
  }
}

