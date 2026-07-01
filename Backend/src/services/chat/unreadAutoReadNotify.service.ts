import type { ChatContextType } from '@prisma/client';
import { ReadReceiptService } from './readReceipt.service';

export type AutoReadAffectedContext = {
  userId: string;
  chatContextType: ChatContextType;
  contextId: string;
};

/** Phase 0 small-batch cap; larger auto-read runs defer to Phase 1 `chat:unread-invalidate`. */
export const AUTO_READ_NOTIFY_MAX_PAIRS = 200;

function affectedContextKey(entry: AutoReadAffectedContext): string {
  return `${entry.userId}\0${entry.chatContextType}\0${entry.contextId}`;
}

export function dedupeAutoReadAffected(
  entries: Iterable<AutoReadAffectedContext>
): AutoReadAffectedContext[] {
  const map = new Map<string, AutoReadAffectedContext>();
  for (const entry of entries) {
    if (!entry.userId || !entry.contextId) continue;
    map.set(affectedContextKey(entry), entry);
  }
  return [...map.values()];
}

export class UnreadAutoReadNotifyService {
  static async notifyOnlineUsers(affected: AutoReadAffectedContext[]): Promise<void> {
    const unique = dedupeAutoReadAffected(affected);
    if (unique.length === 0) return;

    if (unique.length > AUTO_READ_NOTIFY_MAX_PAIRS) {
      console.log(
        `📬 Unread auto-read notify deferred (${unique.length} affected pairs > ${AUTO_READ_NOTIFY_MAX_PAIRS}); Phase 1 chat:unread-invalidate`
      );
      return;
    }

    const socketService = (global as { socketService?: {
      isUserOnline: (userId: string) => boolean;
      emitUnreadCountUpdate: (
        contextType: ChatContextType,
        contextId: string,
        userId: string,
        unreadCount: number
      ) => Promise<void>;
    } }).socketService;
    if (!socketService) return;

    for (const { userId, chatContextType, contextId } of unique) {
      if (!socketService.isUserOnline(userId)) continue;
      const unreadCount = await ReadReceiptService.getUnreadCountForContext(
        chatContextType,
        contextId,
        userId
      );
      await socketService.emitUnreadCountUpdate(
        chatContextType,
        contextId,
        userId,
        unreadCount
      );
    }
  }
}
