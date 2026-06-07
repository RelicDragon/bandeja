import type { Prisma } from '@prisma/client';
import prisma from '../../config/database';

type DbClient = Prisma.TransactionClient | typeof prisma;

export async function isActiveGameMainPhoto(
  gameId: string,
  mainPhotoId: string | null | undefined,
  db: DbClient = prisma
): Promise<boolean> {
  if (!mainPhotoId) return false;
  const photo = await db.gamePhoto.findFirst({
    where: { id: mainPhotoId, gameId, deletedAt: null },
    select: { id: true },
  });
  return photo != null;
}

/** New uploads (including idempotent retries) always become the game main photo. */
export async function assignMainPhotoForUpload(
  gameId: string,
  photoId: string,
  db: DbClient = prisma
): Promise<boolean> {
  const game = await db.game.findUnique({
    where: { id: gameId },
    select: { mainPhotoId: true },
  });
  if (!game || game.mainPhotoId === photoId) {
    return false;
  }

  await db.game.update({
    where: { id: gameId },
    data: { mainPhotoId: photoId },
  });
  return true;
}
