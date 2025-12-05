import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { USER_SELECT_FIELDS } from '../../utils/constants';
import { calculateGameStatus } from '../../utils/gameStatus';
import { GameReadinessService } from './readiness.service';
import { GameReadService } from './read.service';
import { hasParentGamePermission } from '../../utils/parentGamePermissions';
import { createSystemMessage } from '../../controllers/chat.controller';
import { SystemMessageType } from '../../utils/systemMessages';
import telegramNotificationService from '../telegram/notification.service';
import { formatDateInTimezone, getDateLabelInTimezone, getUserTimezoneFromCityId } from '../user-timezone.service';

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

    if (game.entityType === 'TOURNAMENT') {
      updateData.resultsByAnyone = false;
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

    const oldClubId = currentGame?.clubId;
    const oldStartTime = currentGame?.startTime;
    const oldEndTime = currentGame?.endTime;

    // Normalize courtId: convert 'notBooked', empty string, or undefined to null
    let normalizedCourtId: string | null = null;
    if (data.courtId !== undefined) {
      if (data.courtId === 'notBooked' || data.courtId === '' || !data.courtId) {
        normalizedCourtId = null;
        updateData.courtId = null;
      } else {
        normalizedCourtId = data.courtId;
      }
    }

    if (data.clubId !== undefined || data.courtId !== undefined) {
      let cityId: string | null = null;
      const newClubId = data.clubId !== undefined ? data.clubId : currentGame?.clubId;
      const currentCourtId = normalizedCourtId !== null ? normalizedCourtId : (data.courtId === undefined ? currentGame?.courtId : null);

      // If clubId is being changed, validate that current courtId belongs to the new club
      if (data.clubId !== undefined && currentCourtId && newClubId) {
        const court = await prisma.court.findUnique({
          where: { id: currentCourtId },
          select: { clubId: true }
        });

        if (!court) {
          throw new ApiError(404, 'Court not found');
        }

        // If court doesn't belong to the new club, set courtId to null
        if (court.clubId !== newClubId) {
          normalizedCourtId = null;
          updateData.courtId = null;
        }
      }

      // If courtId is being set, validate that it belongs to the current club
      if (data.courtId !== undefined && normalizedCourtId) {
        const court = await prisma.court.findUnique({
          where: { id: normalizedCourtId },
          select: { clubId: true }
        });

        if (!court) {
          throw new ApiError(404, 'Court not found');
        }

        // Validate court belongs to the club (either new or existing)
        const targetClubId = newClubId || currentGame?.clubId;
        if (targetClubId && court.clubId !== targetClubId) {
          throw new ApiError(400, 'Court does not belong to the selected club');
        }
      }

      // Calculate cityId based on final clubId and courtId values
      // Priority: new clubId > new courtId's club > existing clubId > existing courtId's club
      const finalClubId = data.clubId !== undefined ? data.clubId : currentGame?.clubId;
      const finalCourtId = normalizedCourtId !== null ? normalizedCourtId : (data.courtId === undefined ? currentGame?.courtId : null);

      if (data.clubId !== undefined) {
        // If clubId is being updated, use its cityId
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
      } else if (data.courtId !== undefined && finalCourtId) {
        // If only courtId is being updated, use the court's club's cityId
        const court = await prisma.court.findUnique({
          where: { id: finalCourtId },
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
      } else if (finalClubId) {
        // Fallback to existing club's cityId
        const club = await prisma.club.findUnique({
          where: { id: finalClubId },
          select: { cityId: true }
        });

        if (club) {
          cityId = club.cityId;
        } else {
          cityId = null;
        }
      } else {
        cityId = null;
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
        club: true,
        court: {
          include: {
            club: true
          }
        }
      },
    });

    if (!updatedGame) {
      throw new ApiError(404, 'Game not found after update');
    }

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

    const newClubId = updatedGame.clubId;
    const newStartTime = updatedGame.startTime;
    const newEndTime = updatedGame.endTime;

    if (oldClubId !== newClubId && data.clubId !== undefined) {
      const clubName = updatedGame.club?.name || updatedGame.court?.club?.name || 'Unknown location';
      
      try {
        const systemMessage = await createSystemMessage(id, {
          type: SystemMessageType.GAME_CLUB_CHANGED,
          variables: { clubName }
        });

        telegramNotificationService.sendGameSystemMessageNotification(systemMessage, updatedGame).catch(error => {
          console.error('Failed to send Telegram notification for club change:', error);
        });
      } catch (error) {
        console.error('Failed to create system message for club change:', error);
      }
    }

    const startTimeChanged = (oldStartTime && newStartTime) ? oldStartTime.getTime() !== newStartTime.getTime() : (oldStartTime !== newStartTime);
    const endTimeChanged = (oldEndTime && newEndTime) ? oldEndTime.getTime() !== newEndTime.getTime() : (oldEndTime !== newEndTime);
    
    if ((startTimeChanged || endTimeChanged) && (data.startTime !== undefined || data.endTime !== undefined) && newStartTime) {
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { language: true, currentCityId: true }
        });

        const lang = user?.language || 'en';
        const timezone = await getUserTimezoneFromCityId(user?.currentCityId ?? null);
        const dateLabel = await getDateLabelInTimezone(newStartTime, timezone, lang, false);
        const timeStr = await formatDateInTimezone(newStartTime, 'HH:mm', timezone, lang);
        const dateTime = `${dateLabel} ${timeStr}`;

        const systemMessage = await createSystemMessage(id, {
          type: SystemMessageType.GAME_DATE_TIME_CHANGED,
          variables: { dateTime }
        });

        telegramNotificationService.sendGameSystemMessageNotification(systemMessage, updatedGame).catch(error => {
          console.error('Failed to send Telegram notification for date/time change:', error);
        });
      } catch (error) {
        console.error('Failed to create system message for date/time change:', error);
      }
    }

    return updatedGame;
  }
}

