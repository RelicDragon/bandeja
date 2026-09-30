import { ParticipantRole } from '@prisma/client';
import { isGameResultsLocked } from '@bandeja/shared/gameMutationLock';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { hasParentGamePermission } from '../../utils/parentGamePermissions';

export type GamePermissionActor = {
  userId: string;
  isAdmin: boolean;
};

export type GamePermissionOptions = {
  allowArchived?: boolean;
  /** Reject once results entry has begun (roster/settings are frozen). */
  requireRosterMutable?: boolean;
};

export const DEFAULT_GAME_PERMISSION_ROLES: ParticipantRole[] = [
  ParticipantRole.OWNER,
  ParticipantRole.ADMIN,
];

/**
 * Role check on a game or its parent (league season → fixture), plus the archived and
 * results-locked gates. Single source for `requireGamePermission` (HTTP) and any
 * non-HTTP caller (the AI agent), so the two paths cannot drift.
 *
 * Errors, in order: 404 missing game, 400 archived, 400 results locked, 403 role.
 * Note the 403 confirms the game exists — callers that must not leak existence
 * (the agent) run their own visibility check first.
 */
export async function assertGamePermission(
  actor: GamePermissionActor,
  gameId: string,
  allowedRoles: ParticipantRole[] = DEFAULT_GAME_PERMISSION_ROLES,
  options: GamePermissionOptions = {},
): Promise<void> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { id: true, status: true, resultsStatus: true },
  });

  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  if (!options.allowArchived && game.status === 'ARCHIVED') {
    throw new ApiError(400, 'Cannot modify archived games');
  }

  if (options.requireRosterMutable && isGameResultsLocked(game)) {
    throw new ApiError(400, 'errors.games.cannotEditResultsStarted');
  }

  const hasPermission = await hasParentGamePermission(
    gameId,
    actor.userId,
    allowedRoles,
    actor.isAdmin,
  );

  if (!hasPermission) {
    const roleNames = allowedRoles.join(' or ');
    throw new ApiError(403, `Only game ${roleNames.toLowerCase()}s can perform this action`);
  }
}
