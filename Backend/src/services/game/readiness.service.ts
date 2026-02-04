import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { USER_SELECT_FIELDS } from '../../utils/constants';

export class GameReadinessService {
  static async calculateGameReadiness(gameId: string) {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        participants: {
          where: { status: 'PLAYING' },
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
        },
      },
    });

    if (!game) {
      throw new ApiError(404, 'Game not found');
    }

    const playingParticipantsCount = game.participants.length;
    const participantsReady = playingParticipantsCount === game.maxParticipants;

    let teamsReady = false;
    if (game.hasFixedTeams && game.fixedTeams.length > 0) {
      const allTeamsHavePlayers = game.fixedTeams.every(team => team.players.length > 0);
      
      const allPlayersArePlayingParticipants = game.fixedTeams.every(team =>
        team.players.every(player => {
          return game.participants.some(p => p.userId === player.userId);
        })
      );
      
      teamsReady = allTeamsHavePlayers && allPlayersArePlayingParticipants;
      
      console.log('Calculated teamsReady:', {
        gameId: game.id,
        hasFixedTeams: game.hasFixedTeams,
        fixedTeamsCount: game.fixedTeams.length,
        allTeamsHavePlayers,
        allPlayersArePlayingParticipants,
        teamsReady,
        participants: game.participants.map(p => ({ userId: p.userId, status: p.status })),
        fixedTeams: game.fixedTeams.map(team => ({
          teamNumber: team.teamNumber,
          players: team.players.map(p => ({ userId: p.userId }))
        }))
      });
    }

    return {
      participantsReady,
      teamsReady,
    };
  }

  static async updateGameReadiness(gameId: string) {
    const readiness = await this.calculateGameReadiness(gameId);

    return await prisma.game.update({
      where: { id: gameId },
      data: {
        participantsReady: readiness.participantsReady,
        teamsReady: readiness.teamsReady,
      },
    });
  }
}

