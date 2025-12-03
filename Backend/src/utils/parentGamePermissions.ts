import prisma from '../config/database';
import { ParticipantRole } from '@prisma/client';

/**
 * Checks if a user has admin/owner permissions on a game or its parent game
 */
export async function hasParentGamePermission(
  gameId: string,
  userId: string,
  allowedRoles: ParticipantRole[] = [ParticipantRole.OWNER, ParticipantRole.ADMIN]
): Promise<boolean> {
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

/**
 * Checks if a user is a participant in a game (including parent game)
 */
async function isGameParticipant(gameId: string, userId: string): Promise<boolean> {
  const currentGameParticipant = await prisma.gameParticipant.findFirst({
    where: {
      gameId,
      userId,
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
 * Returns true if:
 * - User has admin/owner permissions, OR
 * - resultsByAnyone is true AND user is a participant
 */
export async function canModifyResults(
  gameId: string,
  userId: string,
  resultsByAnyone: boolean
): Promise<boolean> {
  const hasPermission = await hasParentGamePermission(gameId, userId);
  
  if (hasPermission) {
    return true;
  }

  if (resultsByAnyone) {
    return await isGameParticipant(gameId, userId);
  }

  return false;
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

