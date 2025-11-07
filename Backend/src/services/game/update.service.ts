import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { USER_SELECT_FIELDS } from '../../utils/constants';
import { calculateGameStatus } from '../../utils/gameStatus';
import { GameReadinessService } from './readiness.service';
import { GameReadService } from './read.service';

export class GameUpdateService {
  static async updateGame(id: string, data: any, userId: string) {
    const participant = await prisma.gameParticipant.findFirst({
      where: {
        gameId: id,
        userId,
        role: { in: ['OWNER', 'ADMIN'] },
      },
    });

    if (!participant) {
      throw new ApiError(403, 'Only owners and admins can update the game');
    }

    const game = await prisma.game.findUnique({
      where: { id },
      select: { maxParticipants: true, hasFixedTeams: true, entityType: true, genderTeams: true },
    });

    if (!game) {
      throw new ApiError(404, 'Game not found');
    }

    const maxParticipants = data.maxParticipants !== undefined ? data.maxParticipants : game.maxParticipants;
    const hasFixedTeams = maxParticipants === 2 ? false : (data.hasFixedTeams !== undefined ? data.hasFixedTeams : game.hasFixedTeams || false);

    const updateData = { ...data };
    if (maxParticipants === 2) {
      updateData.hasFixedTeams = false;
    } else if (data.hasFixedTeams !== undefined) {
      updateData.hasFixedTeams = hasFixedTeams;
    }

    if (data.genderTeams !== undefined) {
      if (game.entityType !== 'GAME' && game.entityType !== 'TOURNAMENT' && game.entityType !== 'LEAGUE') {
        throw new ApiError(400, 'Gender teams can only be set for GAME, TOURNAMENT, or LEAGUE entity types');
      }
      if (data.genderTeams === 'MIX_PAIRS' && !(maxParticipants >= 4 && maxParticipants % 2 === 0)) {
        throw new ApiError(400, 'MIX_PAIRS can only be set for even number of participants (at least 4)');
      }
      updateData.genderTeams = data.genderTeams;
    }

    const currentGame = await prisma.game.findUnique({
      where: { id },
      select: { startTime: true, endTime: true, resultsStatus: true },
    });

    if (currentGame && (data.startTime !== undefined || data.endTime !== undefined)) {
      const newStartTime = data.startTime ? new Date(data.startTime) : currentGame.startTime;
      const newEndTime = data.endTime ? new Date(data.endTime) : currentGame.endTime;
      updateData.status = calculateGameStatus({
        startTime: newStartTime,
        endTime: newEndTime,
        resultsStatus: currentGame.resultsStatus,
      });
      if (data.startTime !== undefined) {
        updateData.startTime = newStartTime;
      }
      if (data.endTime !== undefined) {
        updateData.endTime = newEndTime;
      }
    }

    await prisma.game.update({
      where: { id },
      data: updateData,
      include: {
        participants: {
          include: {
            user: {
              select: USER_SELECT_FIELDS,
            },
          },
        },
      },
    });

    await GameReadinessService.updateGameReadiness(id);

    const updatedGame = await prisma.game.findUnique({
      where: { id },
      include: {
        participants: {
          include: {
            user: {
              select: USER_SELECT_FIELDS,
            },
          },
        },
      },
    });

    try {
      const socketService = (global as any).socketService;
      console.log(`[GameService] updateGame - socketService exists: ${!!socketService}, updatedGame exists: ${!!updatedGame}`);
      if (socketService && updatedGame) {
        const fullGame = await GameReadService.getGameById(id, userId);
        console.log(`[GameService] updateGame - fullGame fetched: ${!!fullGame}`);
        if (fullGame) {
          await socketService.emitGameUpdate(id, userId, fullGame);
        }
      }
    } catch (error) {
      console.error('Failed to emit game update:', error);
    }

    return updatedGame;
  }
}

