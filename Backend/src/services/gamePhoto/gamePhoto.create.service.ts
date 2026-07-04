import { GamePhotoSource, Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { ImageProcessor } from '../../utils/imageProcessor';
import { deadlockRetryDelayMs, isPrismaDeadlockError } from '../../utils/prismaDeadlock';
import { MAX_PHOTOS_PER_GAME } from './gamePhoto.constants';
import { emitGamePhotoAdded, emitGamePhotoMainChanged } from './gamePhoto.events';
import {
  assertCanManage,
  loadGamePhotoManageContext,
} from './gamePhoto.permissions';
import { assignMainPhotoForUpload } from './gamePhoto.mainPhotoAssign';
import { formatGamePhotoDto, type GamePhotoDto, type PhotoWithUploader } from './gamePhoto.read.service';

const UPLOADER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  avatar: true,
} as const;

export class GamePhotoCreateService {
  private static async finishUpload(
    gameId: string,
    photo: PhotoWithUploader,
    userId: string,
    options: { isNew: boolean; emitAdded: boolean }
  ): Promise<GamePhotoDto> {
    const mainChanged = await assignMainPhotoForUpload(gameId, photo.id);
    const dto = formatGamePhotoDto(photo);
    if (options.emitAdded) {
      await emitGamePhotoAdded(gameId, dto, userId);
    }
    if (options.isNew || mainChanged) {
      await emitGamePhotoMainChanged(gameId, photo.id, userId);
    }
    return dto;
  }

  static async uploadGamePhoto(
    gameId: string,
    userId: string,
    isGlobalAdmin: boolean,
    file: { buffer: Buffer; originalname: string; size: number },
    clientUploadId?: string | null
  ): Promise<GamePhotoDto> {
    const ctx = await loadGamePhotoManageContext(gameId, userId, isGlobalAdmin);
    await assertCanManage(ctx);

    const normalizedClientUploadId = clientUploadId?.trim() || null;
    if (normalizedClientUploadId) {
      const existing = await prisma.gamePhoto.findFirst({
        where: {
          uploaderId: userId,
          clientUploadId: normalizedClientUploadId,
          gameId,
          deletedAt: null,
        },
        include: { uploader: { select: UPLOADER_SELECT } },
      });
      if (existing) {
        return this.finishUpload(gameId, existing, userId, { isNew: false, emitAdded: false });
      }
    }

    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: { photosCount: true, mainPhotoId: true },
    });
    if (!game) {
      throw new ApiError(404, 'Game not found');
    }
    if (game.photosCount >= MAX_PHOTOS_PER_GAME) {
      throw new ApiError(400, `Maximum ${MAX_PHOTOS_PER_GAME} photos per game`);
    }

    const processed = await ImageProcessor.processChatImage(file.buffer, file.originalname);

    try {
      const { photo, isNew } = await prisma.$transaction(async (tx) => {
        if (normalizedClientUploadId) {
          const dup = await tx.gamePhoto.findFirst({
            where: {
              uploaderId: userId,
              clientUploadId: normalizedClientUploadId,
              gameId,
              deletedAt: null,
            },
            include: { uploader: { select: UPLOADER_SELECT } },
          });
          if (dup) {
            await assignMainPhotoForUpload(gameId, dup.id, tx);
            return { photo: dup, isNew: false };
          }
        }

        await tx.$executeRaw(Prisma.sql`SELECT id FROM "Game" WHERE id = ${gameId} FOR UPDATE`);

        const current = await tx.game.findUnique({
          where: { id: gameId },
          select: { photosCount: true, mainPhotoId: true },
        });
        if (!current) {
          throw new ApiError(404, 'Game not found');
        }
        if (current.photosCount >= MAX_PHOTOS_PER_GAME) {
          throw new ApiError(400, `Maximum ${MAX_PHOTOS_PER_GAME} photos per game`);
        }

        const created = await tx.gamePhoto.create({
          data: {
            gameId,
            uploaderId: userId,
            originalUrl: processed.originalPath,
            thumbnailUrl: processed.thumbnailPath ?? processed.originalPath,
            width: processed.originalSize.width || null,
            height: processed.originalSize.height || null,
            thumbWidth: processed.thumbnailSize?.width ?? null,
            thumbHeight: processed.thumbnailSize?.height ?? null,
            byteSize: file.size,
            clientUploadId: normalizedClientUploadId,
          },
          include: { uploader: { select: UPLOADER_SELECT } },
        });

        await tx.game.update({
          where: { id: gameId },
          data: {
            photosCount: { increment: 1 },
            mainPhotoId: created.id,
          },
        });

        return { photo: created, isNew: true };
      });

      return this.finishUpload(gameId, photo, userId, {
        isNew,
        emitAdded: isNew,
      });
    } catch (e) {
      await ImageProcessor.deleteFilePair(processed.originalPath, processed.thumbnailPath);
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && normalizedClientUploadId) {
        const existing = await prisma.gamePhoto.findFirst({
          where: {
            uploaderId: userId,
            clientUploadId: normalizedClientUploadId,
            gameId,
            deletedAt: null,
          },
          include: { uploader: { select: UPLOADER_SELECT } },
        });
        if (existing) {
          return this.finishUpload(gameId, existing, userId, { isNew: false, emitAdded: false });
        }

        const softDeleted = await prisma.gamePhoto.findFirst({
          where: {
            uploaderId: userId,
            clientUploadId: normalizedClientUploadId,
            gameId,
            deletedAt: { not: null },
          },
          include: { uploader: { select: UPLOADER_SELECT } },
        });
        if (softDeleted) {
          const revived = await prisma.$transaction(async (tx) => {
            await tx.$executeRaw(Prisma.sql`SELECT id FROM "Game" WHERE id = ${gameId} FOR UPDATE`);

            const current = await tx.game.findUnique({
              where: { id: gameId },
              select: { photosCount: true },
            });
            if (!current) {
              throw new ApiError(404, 'Game not found');
            }
            if (current.photosCount >= MAX_PHOTOS_PER_GAME) {
              throw new ApiError(400, `Maximum ${MAX_PHOTOS_PER_GAME} photos per game`);
            }

            const updated = await tx.gamePhoto.update({
              where: { id: softDeleted.id },
              data: {
                deletedAt: null,
                originalUrl: processed.originalPath,
                thumbnailUrl: processed.thumbnailPath ?? processed.originalPath,
                width: processed.originalSize.width || null,
                height: processed.originalSize.height || null,
                thumbWidth: processed.thumbnailSize?.width ?? null,
                thumbHeight: processed.thumbnailSize?.height ?? null,
                byteSize: file.size,
              },
              include: { uploader: { select: UPLOADER_SELECT } },
            });

            await tx.game.update({
              where: { id: gameId },
              data: {
                photosCount: { increment: 1 },
                mainPhotoId: updated.id,
              },
            });

            return updated;
          });

          return this.finishUpload(gameId, revived, userId, { isNew: true, emitAdded: true });
        }
      }
      throw e;
    }
  }

  /** AI-generated game photo (bypasses participant upload guards). */
  static async createFromGeneratedBuffer(
    gameId: string,
    buffer: Buffer,
    filename: string
  ): Promise<GamePhotoDto> {
    const processed = await ImageProcessor.processChatImage(buffer, filename);
    const maxAttempts = 3;

    try {
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const photo = await prisma.$transaction(async (tx) => {
            await tx.$executeRaw(
              Prisma.sql`SELECT id FROM "Game" WHERE id = ${gameId} FOR UPDATE`
            );

            const current = await tx.game.findUnique({
              where: { id: gameId },
              select: { photosCount: true, mainPhotoId: true, status: true },
            });
            if (!current) {
              throw new ApiError(404, 'Game not found');
            }
            if (current.photosCount >= MAX_PHOTOS_PER_GAME) {
              throw new ApiError(400, `Maximum ${MAX_PHOTOS_PER_GAME} photos per game`);
            }

            const created = await tx.gamePhoto.create({
              data: {
                gameId,
                uploaderId: null,
                source: GamePhotoSource.AI_GENERATED,
                originalUrl: processed.originalPath,
                thumbnailUrl: processed.thumbnailPath ?? processed.originalPath,
                width: processed.originalSize.width || null,
                height: processed.originalSize.height || null,
                thumbWidth: processed.thumbnailSize?.width ?? null,
                thumbHeight: processed.thumbnailSize?.height ?? null,
                byteSize: buffer.length,
              },
            });

            await tx.game.update({
              where: { id: gameId },
              data: {
                photosCount: { increment: 1 },
                mainPhotoId: created.id,
              },
            });

            return created;
          });

          return formatGamePhotoDto({ ...photo, uploader: null });
        } catch (e) {
          if (isPrismaDeadlockError(e) && attempt + 1 < maxAttempts) {
            await new Promise((r) => setTimeout(r, deadlockRetryDelayMs(attempt)));
            continue;
          }
          throw e;
        }
      }

      throw new Error('createFromGeneratedBuffer: unreachable');
    } catch (e) {
      await ImageProcessor.deleteFilePair(processed.originalPath, processed.thumbnailPath);
      throw e;
    }
  }
}
