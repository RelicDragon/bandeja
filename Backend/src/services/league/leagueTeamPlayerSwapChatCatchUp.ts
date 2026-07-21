import { ChatContextType } from '@prisma/client';
import { ReadReceiptService } from '../chat/readReceipt.service';
import {
  UnreadAutoReadNotifyService,
  type AutoReadAffectedContext,
} from '../chat/unreadAutoReadNotify.service';

/**
 * After a mid-season roster swap, the incoming player becomes a participant on
 * existing fixture chats and would otherwise inherit historical unread.
 * Catch those threads up as read (cursor + receipts) and notify clients.
 */
export async function markLeagueSwapCatchUpChatsRead(
  userId: string,
  gameIds: string[],
): Promise<void> {
  const uniqueGameIds = [...new Set(gameIds.filter((id) => typeof id === 'string' && id.length > 0))];
  if (uniqueGameIds.length === 0) return;

  const affected: AutoReadAffectedContext[] = [];

  for (const gameId of uniqueGameIds) {
    try {
      const result = await ReadReceiptService.markAllMessagesAsRead(gameId, userId, []);
      if (result.count > 0) {
        affected.push({
          userId,
          chatContextType: ChatContextType.GAME,
          contextId: gameId,
        });
      }
    } catch {
      // Access/archived edge cases: skip that game, keep catching up the rest.
    }
  }

  if (affected.length > 0) {
    await UnreadAutoReadNotifyService.notifyOnlineUsers(affected);
  }
}
