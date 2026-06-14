import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import {
  canConfigureGamePhotosPrivacy,
  canManageGamePhotos,
  canViewGamePhotos,
  type GamePhotosPermissionGame,
  type GamePhotosViewer,
} from '../../shared/gamePhotos/permissions';

const GAME_PHOTO_PERMISSION_SELECT = {
  id: true,
  status: true,
  resultsStatus: true,
  forbidOthersPhotosView: true,
  participants: { select: { userId: true, role: true, status: true } },
  parent: {
    select: {
      participants: { select: { userId: true, role: true, status: true } },
    },
  },
} as const;

export type GamePhotoAccessContext = {
  game: GamePhotosPermissionGame & { id: string; status: string };
  userId: string;
  isGlobalAdmin: boolean;
};

export async function loadGameForPhotoPermissions(gameId: string): Promise<GamePhotosPermissionGame & { id: string; status: string }> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: GAME_PHOTO_PERMISSION_SELECT,
  });
  if (!game) {
    throw new ApiError(404, 'Game not found');
  }
  return game;
}

export async function loadGamePhotoManageContext(
  gameId: string,
  userId: string,
  isGlobalAdmin: boolean,
): Promise<GamePhotoAccessContext> {
  const game = await loadGameForPhotoPermissions(gameId);
  return { game, userId, isGlobalAdmin };
}

export function toPhotoViewer(userId: string | null | undefined, isGlobalAdmin: boolean): GamePhotosViewer | undefined {
  if (!userId) return undefined;
  return { id: userId, isAdmin: isGlobalAdmin };
}

export function canReadGamePhotos(
  game: GamePhotosPermissionGame,
  viewer?: GamePhotosViewer | null,
): boolean {
  return canViewGamePhotos(game, viewer);
}

export function canManage(ctx: GamePhotoAccessContext): boolean {
  return canManageGamePhotos(ctx.game, toPhotoViewer(ctx.userId, ctx.isGlobalAdmin));
}

export async function assertCanReadGamePhotos(
  game: GamePhotosPermissionGame,
  viewer?: GamePhotosViewer | null,
): Promise<void> {
  if (!canViewGamePhotos(game, viewer)) {
    throw new ApiError(403, 'Access denied');
  }
}

export async function assertCanManage(ctx: GamePhotoAccessContext): Promise<void> {
  if (!canManage(ctx)) {
    throw new ApiError(403, 'Only participants, admins, and owners can manage game photos');
  }
}

export async function assertCanConfigurePrivacy(
  game: GamePhotosPermissionGame,
  viewer: GamePhotosViewer,
): Promise<void> {
  if (!canConfigureGamePhotosPrivacy(game, viewer)) {
    throw new ApiError(403, 'Only owners and admins can change photo privacy settings');
  }
}
