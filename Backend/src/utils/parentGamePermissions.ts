import prisma from '../config/database';
import { ParticipantRole } from '@prisma/client';
import { ApiError } from './ApiError';

/**
 * Checks if a user has admin/owner permissions on a game or its parent game
 * @param isAdmin - Flag indicating if the user is a global admin
 */
export async function hasParentGamePermission(
  gameId: string,
  userId: string,
  allowedRoles: ParticipantRole[] = [ParticipantRole.OWNER, ParticipantRole.ADMIN],
  isAdmin: boolean
): Promise<boolean> {
  // Global admins have permission to all games
  if (isAdmin) {
    return true;
  }

  // Check current game permissions
  const currentGameParticipant = await prisma.gameParticipant.findFirst({
    where: {
      gameId,
      userId,
      role: { in: allowedRoles },
    },
  });

  if (currentGameParticipant) {
    return true;
  }

  // Check parent game permissions
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { parentId: true },
  });

  if (game?.parentId) {
    const parentGameParticipant = await prisma.gameParticipant.findFirst({
      where: {
        gameId: game.parentId,
        userId,
        role: { in: allowedRoles },
      },
    });

    if (parentGameParticipant) {
      return true;
    }
  }

  return false;
}

const REAL_PARTICIPANT_STATUSES = ['PLAYING', 'NON_PLAYING'] as const;

export async function hasRealParticipantStatus(gameId: string, userId: string): Promise<boolean> {
  const current = await prisma.gameParticipant.findFirst({
    where: { gameId, userId, status: { in: [...REAL_PARTICIPANT_STATUSES] } },
  });
  if (current) return true;
  const game = await prisma.game.findUnique({ where: { id: gameId }, select: { parentId: true } });
  if (!game?.parentId) return false;
  const parent = await prisma.gameParticipant.findFirst({
    where: { gameId: game.parentId, userId, status: { in: [...REAL_PARTICIPANT_STATUSES] } },
  });
  return !!parent;
}

/**
 * Checks if a user is a playing participant in a game (including parent game)
 */
async function isPlayingParticipant(gameId: string, userId: string): Promise<boolean> {
  const currentGameParticipant = await prisma.gameParticipant.findFirst({
    where: {
      gameId,
      userId,
      status: 'PLAYING',
    },
  });

  if (currentGameParticipant) {
    return true;
  }

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { parentId: true },
  });

  if (game?.parentId) {
    const parentGameParticipant = await prisma.gameParticipant.findFirst({
      where: {
        gameId: game.parentId,
        userId,
        status: 'PLAYING',
      },
    });

    if (parentGameParticipant) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if a user can modify results for a game.
 * Fetches the game and validates:
 * - Game exists
 * - Game is not ARCHIVED
 * - User has permission (admin/owner OR resultsByAnyone is true AND user is a participant)
 * @param isAdmin - Flag indicating if the user is a global admin
 * @throws ApiError if game not found, is archived, or user lacks permission
 */
export async function canModifyResults(
  gameId: string,
  userId: string,
  isAdmin: boolean
): Promise<void> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      id: true,
      status: true,
      resultsByAnyone: true,
    },
  });

  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  if (game.status === 'ARCHIVED') {
    throw new ApiError(403, 'Cannot modify results for archived games');
  }

  const hasPermission = await hasParentGamePermission(gameId, userId, [ParticipantRole.OWNER, ParticipantRole.ADMIN], isAdmin);
  
  if (hasPermission) {
    return;
  }

  if (game.resultsByAnyone) {
    const isParticipant = await isPlayingParticipant(gameId, userId);
    if (isParticipant) {
      return;
    }
  }

  throw new ApiError(403, 'Only game owners/admins can modify results');
}

/**
 * Checks if a user is admin/owner of the current game or its parent
 * Returns the participant record if found
 */
export async function getParentGameParticipant(
  gameId: string,
  userId: string,
  allowedRoles: ParticipantRole[] = [ParticipantRole.OWNER, ParticipantRole.ADMIN]
) {
  // Check current game first
  const currentGameParticipant = await prisma.gameParticipant.findFirst({
    where: {
      gameId,
      userId,
      role: { in: allowedRoles },
    },
  });

  if (currentGameParticipant) {
    return { participant: currentGameParticipant, isFromParent: false };
  }

  // Check parent game
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { parentId: true },
  });

  if (game?.parentId) {
    const parentGameParticipant = await prisma.gameParticipant.findFirst({
      where: {
        gameId: game.parentId,
        userId,
        role: { in: allowedRoles },
      },
    });

    if (parentGameParticipant) {
      return { participant: parentGameParticipant, isFromParent: true };
    }
  }

  return null;
}

/**
 * Checks if a user has admin/owner permissions on a game or its parent game
 * Fetches the user's admin status automatically
 */
export async function hasParentGamePermissionWithUserCheck(
  gameId: string,
  userId: string,
  allowedRoles: ParticipantRole[] = [ParticipantRole.OWNER, ParticipantRole.ADMIN]
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  });

  if (!user) {
    return false;
  }

  return hasParentGamePermission(gameId, userId, allowedRoles, user.isAdmin);
}


