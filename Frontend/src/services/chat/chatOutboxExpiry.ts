import type { ChatContextType } from '@/api/chat';
import { chatLocalDb } from './chatLocalDb';
import { messageQueueStorage } from '@/services/chatMessageQueueStorage';
import { cancelSend } from '@/services/chatSendService';
import { CHAT_OUTBOX_REMOVED_EVENT } from '@/services/chat/chatOutboxEvents';

/** Failed outbox rows older than this are dropped locally (no auto-retry). */
export const CHAT_FAILED_OUTBOX_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

function ctxKey(contextType: ChatContextType, contextId: string): string {
  return `${contextType}:${contextId}`;
}

export async function purgeExpiredFailedOutbox(): Promise<number> {
  const rows = await chatLocalDb.outbox.toArray();
  const cutoff = Date.now() - CHAT_FAILED_OUTBOX_MAX_AGE_MS;
  const expired = rows.filter((r) => {
    if (r.status !== 'failed') return false;
    const t = new Date(r.createdAt).getTime();
    return Number.isFinite(t) && t < cutoff;
  });
  if (expired.length === 0) return 0;

  const groups = new Map<
    string,
    { contextType: ChatContextType; contextId: string; tempIds: string[] }
  >();

  for (const r of expired) {
    const k = ctxKey(r.contextType, r.contextId);
    cancelSend(r.tempId);
    await messageQueueStorage.remove(r.tempId, r.contextType, r.contextId);
    let g = groups.get(k);
    if (!g) {
      g = { contextType: r.contextType, contextId: r.contextId, tempIds: [] };
      groups.set(k, g);
    }
    g.tempIds.push(r.tempId);
  }

  for (const g of groups.values()) {
    window.dispatchEvent(
      new CustomEvent(CHAT_OUTBOX_REMOVED_EVENT, {
        detail: {
          contextType: g.contextType,
          contextId: g.contextId,
          tempIds: g.tempIds,
        },
      })
    );
  }

  return expired.length;
}
