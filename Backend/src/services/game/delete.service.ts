import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { ImageProcessor } from '../../utils/imageProcessor';
import { ChatContextType, ChatSyncEventType, ParticipantRole, Sport } from '@prisma/client';
import { ChatSyncEventService } from '../chat/chatSyncEvent.service';
import notificationService from '../notification.service';
import { USER_SELECT_FIELDS, USER_SPORT_PROFILE_SELECT } from '../../utils/constants';
import { projectUserForSportContext } from '../user/userSportProfile.service';

export class GameDeleteService {
  static async deleteGame(id: string, cancelledByUserId: string) {
    const game = await prisma.game.findUnique({
      where: { id },
      select: {
        id: true,
        entityType: true,
        name: true,
        sport: true,
        cityId: true,
        startTime: true,
        mediaUrls: true,
        status: true,
        resultsStatus: true,
        participants: {
          select: { userId: true, role: true },
        },
      },
    });

    if (!game) {
      throw new ApiError(404, 'Game not found');
    }

    if (game.resultsStatus !== 'NONE') {
      throw new ApiError(400, 'Cannot delete a game that has results');
    }

    const childCount = await prisma.game.count({ where: { parentId: id } });
    if (childCount > 0) {
      throw new ApiError(400, 'errors.games.cannotDeleteHasChildren');
    }

    const participantUserIds = game.participants
      .filter((p) => p.role !== ParticipantRole.OWNER)
      .map((p) => p.userId);
    const uniqueRecipientIds = [...new Set(participantUserIds)];

    if (game.mediaUrls && game.mediaUrls.length > 0) {
      for (const mediaUrl of game.mediaUrls) {
        try {
          await ImageProcessor.deleteFile(mediaUrl);
          const thumbnailUrl = mediaUrl.replace('/originals/', '/thumbnails/').replace(/(\.[^.]+)$/, '_thumb$1');
          await ImageProcessor.deleteFile(thumbnailUrl);
        } catch (error) {
          console.error(`Error deleting media file ${mediaUrl}:`, error);
        }
      }
    }

    await prisma.$transaction(async (tx) => {
      await ChatSyncEventService.appendEventInTransaction(
        tx,
        ChatContextType.GAME,
        id,
        ChatSyncEventType.THREAD_LOCAL_INVALIDATE,
        {}
      );
      await tx.cancelledGame.create({
        data: {
          id: game.id,
          entityType: game.entityType,
          name: game.name,
          sport: game.sport ?? Sport.PADEL,
          cancelledByUserId,
          cityId: game.cityId,
          startTime: game.startTime,
        },
      });
      await tx.game.delete({ where: { id } });
    });

    const cancelledSport = game.sport ?? Sport.PADEL;
    const cancelledByUserRaw = await prisma.user.findUnique({
      where: { id: cancelledByUserId },
      select: {
        ...USER_SELECT_FIELDS,
        sportProfiles: { select: USER_SPORT_PROFILE_SELECT },
      },
    });
    const cancelledByUser = cancelledByUserRaw
      ? projectUserForSportContext(cancelledByUserRaw, cancelledSport)
      : undefined;
    const cancelledMeta = {
      gameId: id,
      entityType: game.entityType,
      name: game.name ?? undefined,
      sport: cancelledSport,
      cancelledAt: new Date().toISOString(),
      cancelledByUser,
    };
    try {
      await notificationService.sendGameCancelledNotification(cancelledMeta, uniqueRecipientIds);
      const socketService = (global as any).socketService;
      if (socketService?.emitGameCancelled) {
        socketService.emitGameCancelled(id, cancelledMeta);
      }
    } catch (err) {
      console.error('Game cancelled: failed to notify participants', err);
    }
  }
}

