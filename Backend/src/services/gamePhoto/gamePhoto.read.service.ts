import prisma from '../../config/database';
import { Prisma } from '@prisma/client';
import { getUserDisplayName } from '../../utils/systemMessages';
import { DEFAULT_PHOTOS_PAGE_LIMIT } from './gamePhoto.constants';
import {
  assertCanReadGamePhotos,
  loadGameForPhotoPermissions,
  toPhotoViewer,
} from './gamePhoto.permissions';

const UPLOADER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  avatar: true,
} as const;

type PhotoWithUploader = Prisma.GamePhotoGetPayload<{
  include: { uploader: { select: typeof UPLOADER_SELECT } };
}>;

export type { PhotoWithUploader };

export type GamePhotoDto = {
  id: string;
  gameId: string;
  originalUrl: string;
  thumbnailUrl: string;
  uploader?: { id: string; name: string; avatar: string | null };
  createdAt: string;
};

export function formatGamePhotoDto(photo: PhotoWithUploader): GamePhotoDto {
  const dto: GamePhotoDto = {
    id: photo.id,
    gameId: photo.gameId,
    originalUrl: photo.originalUrl,
    thumbnailUrl: photo.thumbnailUrl,
    createdAt: photo.createdAt.toISOString(),
  };
  if (photo.uploader) {
    dto.uploader = {
      id: photo.uploader.id,
      name: getUserDisplayName(photo.uploader.firstName, photo.uploader.lastName),
      avatar: photo.uploader.avatar,
    };
  }
  return dto;
}

export class GamePhotoReadService {
  static async listGamePhotos(
    gameId: string,
    userId: string | null,
    isGlobalAdmin: boolean,
    options: { limit?: number; cursor?: string | null } = {}
  ): Promise<{ items: GamePhotoDto[]; nextCursor: string | null }> {
    const game = await loadGameForPhotoPermissions(gameId);
    await assertCanReadGamePhotos(game, toPhotoViewer(userId, isGlobalAdmin));

    const limit = Math.min(
      DEFAULT_PHOTOS_PAGE_LIMIT,
      Math.max(1, options.limit ?? DEFAULT_PHOTOS_PAGE_LIMIT)
    );
    const cursor = options.cursor?.trim() || null;

    const photos = await prisma.gamePhoto.findMany({
      where: {
        gameId,
        deletedAt: null,
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      orderBy: { id: 'desc' },
      take: limit + 1,
      include: { uploader: { select: UPLOADER_SELECT } },
    });

    const hasMore = photos.length > limit;
    const page = hasMore ? photos.slice(0, limit) : photos;
    const nextCursor = hasMore ? page[page.length - 1]?.id ?? null : null;

    return {
      items: page.map(formatGamePhotoDto),
      nextCursor,
    };
  }

  static async getMainPhotoUrl(game: { mainPhotoId?: string | null }): Promise<string | null> {
    if (!game.mainPhotoId) return null;

    const photo = await prisma.gamePhoto.findFirst({
      where: { id: game.mainPhotoId, deletedAt: null },
      select: { originalUrl: true },
    });
    if (!photo?.originalUrl) return null;

    const url = photo.originalUrl;
    if (!url.startsWith('http') && !url.startsWith('/')) return null;
    return url;
  }

}
