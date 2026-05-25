import { GamePhotoSource, Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { ImageProcessor } from '../../utils/imageProcessor';
import { MAX_PHOTOS_PER_GAME } from './gamePhoto.constants';
import { emitGamePhotoAdded } from './gamePhoto.events';
import {
  assertCanUpload,
  loadGamePhotoAccessContext,
} from './gamePhoto.permissions';
import { formatGamePhotoDto, type GamePhotoDto } from './gamePhoto.read.service';
import {
  shouldSetAiAsMainPhoto,
  type MainPhotoEnqueueSnapshot,
} from '../gameResultsArtifact/gameResultsArtifact.mainPhotoSnapshot';

const UPLOADER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  avatar: true,
} as const;

export class GamePhotoCreateService {
  static async uploadGamePhoto(
    gameId: string,
    userId: string,
    isGlobalAdmin: boolean,
    file: { buffer: Buffer; originalname: string; size: number },
    clientUploadId?: string | null
  ): Promise<GamePhotoDto> {
    const ctx = await loadGamePhotoAccessContext(gameId, userId, isGlobalAdmin);
    await assertCanUpload(ctx);

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
        return formatGamePhotoDto(existing);
      }
    }

    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: { photosCount: true, mainPhotoId: true, status: true },
    });
    if (!game) {
      throw new ApiError(404, 'Game not found');
    }
    if (game.status === 'ANNOUNCED') {
      throw new ApiError(403, 'Cannot upload photos before the game has started');
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
            return { photo: dup, isNew: false };
          }
        }

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
            ...(current.mainPhotoId ? {} : { mainPhotoId: created.id }),
          },
        });

        return { photo: created, isNew: true };
      });

      const dto = formatGamePhotoDto(photo);
      if (isNew) {
        await emitGamePhotoAdded(gameId, dto, userId);
      }
      return dto;
    } catch (e) {
      await ImageProcessor.deleteFilePair(processed.originalPath, processed.thumbnailPath);
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const existing = await prisma.gamePhoto.findFirst({
          where: {
            uploaderId: userId,
            clientUploadId: normalizedClientUploadId!,
            gameId,
            deletedAt: null,
          },
          include: { uploader: { select: UPLOADER_SELECT } },
        });
        if (existing) {
          return formatGamePhotoDto(existing);
        }
      }
      throw e;
    }
  }

  /** AI-generated game photo (bypasses participant upload guards). */
  static async createFromGeneratedBuffer(
    gameId: string,
    buffer: Buffer,
    filename: string,
    mainPhotoSnapshot?: MainPhotoEnqueueSnapshot
  ): Promise<GamePhotoDto> {
    const processed = await ImageProcessor.processChatImage(buffer, filename);

    try {
      const photo = await prisma.$transaction(async (tx) => {
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

        const setMain =
          mainPhotoSnapshot &&
          shouldSetAiAsMainPhoto(mainPhotoSnapshot, {
            photosCount: current.photosCount,
            mainPhotoId: current.mainPhotoId,
          });

        await tx.game.update({
          where: { id: gameId },
          data: {
            photosCount: { increment: 1 },
            ...(setMain ? { mainPhotoId: created.id } : {}),
          },
        });

        return created;
      });

      return formatGamePhotoDto({ ...photo, uploader: null });
    } catch (e) {
      await ImageProcessor.deleteFilePair(processed.originalPath, processed.thumbnailPath);
      throw e;
    }
  }
}
