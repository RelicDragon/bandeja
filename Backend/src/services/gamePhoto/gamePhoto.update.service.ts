import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { emitGamePhotoMainChanged } from './gamePhoto.events';
import {
  assertCanManage,
  loadGamePhotoManageContext,
} from './gamePhoto.permissions';

export class GamePhotoUpdateService {
  static async setMainPhoto(
    gameId: string,
    userId: string,
    isGlobalAdmin: boolean,
    photoId: string | null
  ): Promise<{ gameId: string; mainPhotoId: string | null }> {
    const ctx = await loadGamePhotoManageContext(gameId, userId, isGlobalAdmin);
    await assertCanManage(ctx);

    if (photoId) {
      const photo = await prisma.gamePhoto.findFirst({
        where: { id: photoId, gameId, deletedAt: null },
        select: { id: true },
      });
      if (!photo) {
        throw new ApiError(404, 'Photo not found');
      }
    }

    await prisma.game.update({
      where: { id: gameId },
      data: { mainPhotoId: photoId },
    });

    await emitGamePhotoMainChanged(gameId, photoId, userId);

    return { gameId, mainPhotoId: photoId };
  }
}
