import { GamePhotoSource } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { ImageProcessor } from '../../utils/imageProcessor';

/** Soft-delete AI-generated photos so a new artifact photo can be created. Throws if USER photos exist. */
export async function clearAiGeneratedPhotosForRegeneration(gameId: string): Promise<void> {
  const photos = await prisma.gamePhoto.findMany({
    where: { gameId, deletedAt: null },
    select: { id: true, source: true, originalUrl: true, thumbnailUrl: true },
  });

  if (photos.length === 0) return;

  const hasUserPhoto = photos.some((p) => p.source === GamePhotoSource.USER);
  if (hasUserPhoto) {
    throw new ApiError(400, 'Game already has user-uploaded photos');
  }

  const aiPhotos = photos.filter((p) => p.source === GamePhotoSource.AI_GENERATED);
  if (aiPhotos.length === 0) return;

  const deletedAt = new Date();

  await prisma.$transaction(async (tx) => {
    for (const photo of aiPhotos) {
      await tx.gamePhoto.update({
        where: { id: photo.id },
        data: { deletedAt },
      });
    }

    await tx.game.update({
      where: { id: gameId },
      data: {
        photosCount: 0,
        mainPhotoId: null,
      },
    });
  });

  for (const photo of aiPhotos) {
    try {
      await ImageProcessor.deleteFile(photo.originalUrl);
      await ImageProcessor.deleteFile(photo.thumbnailUrl);
    } catch (error) {
      console.error('[clearAiGeneratedPhotosForRegeneration] file delete failed', {
        gameId,
        photoId: photo.id,
        error,
      });
    }
  }
}
