import { ParticipantRole } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';
import {
  hasParentGamePermissionWithUserCheck,
} from '../../utils/parentGamePermissions';
import { MessageService } from '../chat/message.service';

export type GamePhotoAccessContext = {
  game: { id: string; status: string };
  participant?: { status: string; role: string } | null;
  userId: string;
  isGlobalAdmin: boolean;
};

export async function loadGamePhotoAccessContext(
  gameId: string,
  userId: string,
  isGlobalAdmin: boolean
): Promise<GamePhotoAccessContext> {
  const { game, participant, isParticipant } = await MessageService.validateGameAccess(gameId, userId);
  if (!isParticipant) {
    throw new ApiError(403, 'Access denied');
  }
  return { game, participant, userId, isGlobalAdmin };
}

export function canRead(ctx: GamePhotoAccessContext): boolean {
  return ctx.game.status !== 'ANNOUNCED';
}

export async function canUpload(ctx: GamePhotoAccessContext): Promise<boolean> {
  if (ctx.game.status === 'ANNOUNCED') return false;
  const isPlaying = ctx.participant?.status === 'PLAYING';
  const isAdminOrOwner =
    ctx.participant?.role === ParticipantRole.OWNER ||
    ctx.participant?.role === ParticipantRole.ADMIN;
  if (ctx.isGlobalAdmin || isPlaying || isAdminOrOwner) return true;
  return hasParentGamePermissionWithUserCheck(ctx.game.id, ctx.userId, [
    ParticipantRole.OWNER,
    ParticipantRole.ADMIN,
  ]);
}

export async function canSetMain(ctx: GamePhotoAccessContext): Promise<boolean> {
  if (ctx.isGlobalAdmin) return true;
  const isAdminOrOwner =
    ctx.participant?.role === ParticipantRole.OWNER ||
    ctx.participant?.role === ParticipantRole.ADMIN;
  if (isAdminOrOwner) return true;
  return hasParentGamePermissionWithUserCheck(ctx.game.id, ctx.userId, [
    ParticipantRole.OWNER,
    ParticipantRole.ADMIN,
  ]);
}

export async function canDelete(
  ctx: GamePhotoAccessContext,
  photo: { uploaderId: string | null }
): Promise<boolean> {
  if (photo.uploaderId === ctx.userId) return true;
  return canSetMain(ctx);
}

export async function assertCanRead(ctx: GamePhotoAccessContext): Promise<void> {
  if (!canRead(ctx)) {
    throw new ApiError(403, 'Game photos are only available after the game has started');
  }
}

export async function assertCanUpload(ctx: GamePhotoAccessContext): Promise<void> {
  if (!(await canUpload(ctx))) {
    throw new ApiError(403, 'Only playing participants, admins, and owners can upload photos');
  }
}

export async function assertCanSetMain(ctx: GamePhotoAccessContext): Promise<void> {
  if (!(await canSetMain(ctx))) {
    throw new ApiError(403, 'Only game owners and admins can set the main photo');
  }
}

export async function assertCanDelete(
  ctx: GamePhotoAccessContext,
  photo: { uploaderId: string | null }
): Promise<void> {
  if (!(await canDelete(ctx, photo))) {
    throw new ApiError(403, 'You cannot delete this photo');
  }
}
