import { ChatContextType } from '@prisma/client';
import prisma from '../../config/database';
import { UnreadCountBatchService } from '../chat/unreadCountBatch.service';

export type RecomputeGameUnreadResult = {
  gameId: string;
  userId: string;
  previousWouldIncludePhotos: boolean;
  unreadCount: number;
};

/**
 * Recompute per-participant game unread after PHOTOS channel removal (Phase B½).
 * Does not require socket — clients pick up on next snapshot fetch.
 */
export async function recomputeUnreadForGameIds(
  gameIds: string[]
): Promise<RecomputeGameUnreadResult[]> {
  if (gameIds.length === 0) return [];

  const results: RecomputeGameUnreadResult[] = [];

  const games = await prisma.game.findMany({
    where: { id: { in: gameIds } },
    select: {
      id: true,
      status: true,
      participants: {
        select: { userId: true, status: true, role: true },
      },
    },
  });

  for (const game of games) {
    for (const participant of game.participants) {
      const chatTypeFilter =
        await UnreadCountBatchService.resolveGameChatTypeFilterForUser(
          game.id,
          participant.userId,
          participant,
          game.status
        );

      const unreadCount = await UnreadCountBatchService.getGameUnreadCount(
        game.id,
        participant.userId,
        chatTypeFilter
      );

      results.push({
        gameId: game.id,
        userId: participant.userId,
        previousWouldIncludePhotos: game.status !== 'ANNOUNCED',
        unreadCount,
      });
    }
  }

  return results;
}

/** Optional socket push when server is running (e.g. one-off admin job). */
export async function emitUnreadUpdatesForResults(
  rows: RecomputeGameUnreadResult[]
): Promise<number> {
  const socketService = (global as { socketService?: {
    emitUnreadCountUpdate: (
      contextType: ChatContextType,
      contextId: string,
      userId: string,
      unreadCount: number
    ) => Promise<void>;
  } }).socketService;

  if (!socketService?.emitUnreadCountUpdate) return 0;

  let emitted = 0;
  for (const row of rows) {
    await socketService.emitUnreadCountUpdate(
      ChatContextType.GAME,
      row.gameId,
      row.userId,
      row.unreadCount
    );
    emitted++;
  }
  return emitted;
}
