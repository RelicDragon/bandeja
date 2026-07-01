import type { ChatContextType } from '@prisma/client';
import { getChatNotifier } from './chatNotifier';
import { lookupBugGroupChannelIds } from './bugGroupChannelLookup';
import {
  resolveMessageUnreadContext,
} from './messageCreateUnreadNotify.service';
import { bumpUserRevisionsAndEmitInvalidation } from './unreadBulkInvalidate.service';
import { UnreadAuthority } from './unreadAuthority';

export type AutoReadAffectedContext = {
  userId: string;
  chatContextType: ChatContextType;
  contextId: string;
};

/** Small batches emit per-context authority envelopes; larger auto-read runs use `chat:unread-invalidate`. */
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
      await bumpUserRevisionsAndEmitInvalidation(
        unique.map((entry) => entry.userId),
        'auto_read'
      );
      return;
    }

    const notifier = getChatNotifier();
    const bugIds = unique
      .filter((entry) => entry.chatContextType === 'BUG')
      .map((entry) => entry.contextId);
    const bugGroupChannelIds = await lookupBugGroupChannelIds(bugIds);

    for (const { userId, chatContextType, contextId } of unique) {
      if (!notifier.isUserOnline(userId)) continue;

      const resolved = resolveMessageUnreadContext(
        chatContextType,
        contextId,
        chatContextType === 'BUG' ? bugGroupChannelIds.get(contextId) ?? null : undefined
      );
      if (!resolved) continue;

      await UnreadAuthority.recordContextChanged({
        userId,
        contextKey: resolved.contextKey,
        contextType: resolved.contextType,
        contextId: resolved.contextId,
        reason: 'auto_read',
        ...(resolved.countAdapter ? { countAdapter: resolved.countAdapter } : {}),
        ...(resolved.groupChannelMeta ? { groupChannelMeta: resolved.groupChannelMeta } : {}),
      });
    }
  }
}
