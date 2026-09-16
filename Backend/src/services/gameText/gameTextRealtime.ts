import prisma from '../../config/database';
import {
  GAME_TEXT_INVALIDATE_EVENT,
  type GameTextInvalidation,
  type GameTextInvalidationReason,
} from '@bandeja/shared/gameTextRealtime';

export {
  GAME_TEXT_INVALIDATE_EVENT,
  type GameTextInvalidation,
  type GameTextInvalidationReason,
};

export type PublishGameTextInvalidationInput = {
  gameId: string;
  locale: string;
  nameSourceRevision: number;
  descriptionSourceRevision: number;
  reason: GameTextInvalidationReason;
};

type GameTextSocketEmitter = {
  emitGameTextInvalidation(
    payload: GameTextInvalidation,
    userIds: string[],
  ): void;
};

function socketEmitter(): GameTextSocketEmitter | undefined {
  return (global as { socketService?: GameTextSocketEmitter }).socketService;
}

async function resolveAuthorizedUserIds(gameId: string): Promise<string[]> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      trainerId: true,
      participants: { select: { userId: true } },
    },
  });
  if (!game) return [];
  const ids = new Set<string>();
  if (game.trainerId) ids.add(game.trainerId);
  for (const p of game.participants) {
    if (p.userId) ids.add(p.userId);
  }
  return [...ids];
}

/**
 * Post-commit realtime invalidation. Payload never includes translated text.
 * Rooms: `game-{gameId}` + `notify-user-*` for authorized users only.
 * HTTP remains authoritative; reconnect/focus and capped pending polls recover misses.
 */
export async function publishGameTextInvalidation(
  input: PublishGameTextInvalidationInput,
): Promise<void> {
  try {
    const emitter = socketEmitter();
    if (!emitter) return;
    const userIds = await resolveAuthorizedUserIds(input.gameId);
    emitter.emitGameTextInvalidation(
      {
        version: 1,
        gameId: input.gameId,
        locale: input.locale,
        nameSourceRevision: input.nameSourceRevision,
        descriptionSourceRevision: input.descriptionSourceRevision,
        reason: input.reason,
        occurredAt: new Date().toISOString(),
      },
      userIds,
    );
  } catch (error) {
    console.error('[GameTextRealtime] Failed to publish invalidation', {
      gameId: input.gameId,
      locale: input.locale,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
