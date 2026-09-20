/**
 * Authorization for `GET /api/results/game/:gameId`.
 *
 * The route is `optionalAuth` because the results tab is reachable by guests on
 * a **public** game (deep links, Telegram, the Live rail). That is the only
 * thing it was ever meant to serve anonymously. It used to serve private games
 * to anyone holding a game id as well, which is what this module closes.
 *
 * Fail closed, and answer 404 — not 403 — for a private game the viewer has no
 * relationship with, so the endpoint is not a game-existence oracle.
 */
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';

/** Roster rows that count as "this game is mine". Invites do not. */
const RELATED_PARTICIPANT_STATUSES = ['PLAYING', 'NON_PLAYING', 'IN_QUEUE', 'GUEST'] as const;

export type GameResultsAccessDecision = {
  gameId: string;
  isPublic: boolean;
  /** `true` when the viewer holds a roster row on the game or its parent. */
  viewerIsRelated: boolean;
  viewerIsPlatformAdmin: boolean;
};

/**
 * Throws 404 unless the viewer may read this game's results.
 *
 * Public game → anyone, signed in or not.
 * Private game → a roster member of the game or of its parent (a league season
 * shell, for a fixture), or platform staff.
 */
export async function assertCanReadGameResults(
  gameId: string,
  viewerUserId: string | null | undefined,
): Promise<GameResultsAccessDecision> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { id: true, isPublic: true, parentId: true },
  });
  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  if (game.isPublic) {
    return {
      gameId: game.id,
      isPublic: true,
      viewerIsRelated: false,
      viewerIsPlatformAdmin: false,
    };
  }

  if (!viewerUserId) {
    throw new ApiError(404, 'Game not found');
  }

  const [viewer, membership] = await Promise.all([
    prisma.user.findUnique({ where: { id: viewerUserId }, select: { isAdmin: true } }),
    prisma.gameParticipant.findFirst({
      where: {
        userId: viewerUserId,
        status: { in: [...RELATED_PARTICIPANT_STATUSES] },
        gameId: game.parentId ? { in: [game.id, game.parentId] } : game.id,
      },
      select: { id: true },
    }),
  ]);

  const viewerIsPlatformAdmin = Boolean(viewer?.isAdmin);
  const viewerIsRelated = Boolean(membership);
  if (!viewerIsPlatformAdmin && !viewerIsRelated) {
    throw new ApiError(404, 'Game not found');
  }

  return {
    gameId: game.id,
    isPublic: false,
    viewerIsRelated,
    viewerIsPlatformAdmin,
  };
}
