import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { USER_SELECT_FIELDS } from '../../utils/constants';
import { calculateGameStatus } from '../../utils/gameStatus';
import { GameReadinessService } from './readiness.service';
import { GameReadService } from './read.service';
import { hasParentGamePermission } from '../../utils/parentGamePermissions';

export class GameUpdateService {
  static async updateGame(id: string, data: any, userId: string) {
    const hasPermission = await hasParentGamePermission(id, userId);

    if (!hasPermission) {
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

    const updateData: any = { ...data };
    if (maxParticipants === 2) {
      updateData.hasFixedTeams = false;
    } else if (data.hasFixedTeams !== undefined) {
      updateData.hasFixedTeams = hasFixedTeams;
    }

    // Handle avatar deletion
    if (data.avatar === null || data.originalAvatar === null) {
      const currentGame = await prisma.game.findUnique({
        where: { id },
        select: { avatar: true, originalAvatar: true }
      });

      if (data.avatar === null && currentGame?.avatar) {
        const ImageProcessor = (await import('../../utils/imageProcessor')).ImageProcessor;
        await ImageProcessor.deleteFile(currentGame.avatar);
        updateData.avatar = null;
      }
      if (data.originalAvatar === null && currentGame?.originalAvatar) {
        const ImageProcessor = (await import('../../utils/imageProcessor')).ImageProcessor;
        await ImageProcessor.deleteFile(currentGame.originalAvatar);
        updateData.originalAvatar = null;
      }
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
      select: { startTime: true, endTime: true, resultsStatus: true, clubId: true, courtId: true },
    });

    if (data.clubId !== undefined || data.courtId !== undefined) {
      let cityId: string | null = null;

      if (data.clubId !== undefined) {
        if (data.clubId) {
          const club = await prisma.club.findUnique({
            where: { id: data.clubId },
            select: { cityId: true }
          });

          if (!club) {
            throw new ApiError(404, 'Club not found');
          }

          cityId = club.cityId;
        } else {
          cityId = null;
        }
      } else if (data.courtId !== undefined) {
        if (data.courtId) {
          const court = await prisma.court.findUnique({
            where: { id: data.courtId },
            select: { 
              club: {
                select: { cityId: true }
              }
            }
          });

          if (!court) {
            throw new ApiError(404, 'Court not found');
          }

          cityId = court.club.cityId;
        } else {
          cityId = null;
        }
      }

      updateData.cityId = cityId;
    }

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

