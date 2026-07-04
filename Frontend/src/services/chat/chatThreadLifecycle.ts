import type { ChatContextType } from '@/api/chat';
import { cancelSend } from '@/services/chatSendService';
import { messageQueueStorage } from '@/services/chatMessageQueueStorage';
import { dispatchChatSyncStale } from '@/utils/chatSyncStaleEvents';
import { recordChatSyncStaleDispatch } from '@/services/chat/chatSyncMetrics';
import { socketService } from '@/services/socketService';
import { chatCursorKey, chatLocalDb } from './chatLocalDb';
import { CHAT_OUTBOX_REMOVED_EVENT } from './chatOutboxEvents';
import { purgeLocalDexieThread } from './chatLocalThreadPurge';

export type ThreadTerminalKind = 'invalidate' | 'archived';

const archivedContextKeys = new Set<string>();

export function markThreadArchivedInMemory(contextType: ChatContextType, contextId: string): void {
  archivedContextKeys.add(chatCursorKey(contextType, contextId));
}

export function clearThreadArchivedInMemory(contextType: ChatContextType, contextId: string): void {
  archivedContextKeys.delete(chatCursorKey(contextType, contextId));
}

export function isThreadArchivedInMemory(contextType: ChatContextType, contextId: string): boolean {
  return archivedContextKeys.has(chatCursorKey(contextType, contextId));
}

export function parseContextFromTailKey(
  threadKey: string
): { contextType: ChatContextType; contextId: string } | null {
  const [contextType, contextId] = threadKey.split(':');
  if (!contextType || !contextId) return null;
  if (contextType !== 'GAME' && contextType !== 'GROUP' && contextType !== 'USER') return null;
  return { contextType, contextId };
}

export async function dropPendingOutboxForContext(
  contextType: ChatContextType,
  contextId: string
): Promise<string[]> {
  const rows = await messageQueueStorage.getByContext(contextType, contextId);
  const tempIds: string[] = [];
  for (const row of rows) {
    cancelSend(row.tempId);
    tempIds.push(row.tempId);
    await messageQueueStorage.remove(row.tempId, contextType, contextId);
  }
  if (tempIds.length > 0 && typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(CHAT_OUTBOX_REMOVED_EVENT, {
        detail: { contextType, contextId, tempIds },
      })
    );
  }
  return tempIds;
}

async function persistThreadArchivedMeta(
  contextType: ChatContextType,
  contextId: string,
  archivedAtMs: number,
  syncSeq?: number
): Promise<void> {
  const key = chatCursorKey(contextType, contextId);
  markThreadArchivedInMemory(contextType, contextId);
  await chatLocalDb.transaction('rw', [chatLocalDb.chatThreads, chatLocalDb.chatSyncCursor], async () => {
    const row = await chatLocalDb.chatThreads.get(key);
    const now = Date.now();
    await chatLocalDb.chatThreads.put({
      key,
      serverMaxSeq: row?.serverMaxSeq ?? 0,
      updatedAt: now,
      archivedAt: archivedAtMs,
      ...(row?.lastPullStartedAt != null ? { lastPullStartedAt: row.lastPullStartedAt } : {}),
      ...(row?.lastSuccessfulPullAt != null ? { lastSuccessfulPullAt: row.lastSuccessfulPullAt } : {}),
      ...(row?.nextRetryAt != null ? { nextRetryAt: row.nextRetryAt } : {}),
      ...(row?.pullErrorAt != null ? { pullErrorAt: row.pullErrorAt } : {}),
      ...(row?.lastOpenedAt != null ? { lastOpenedAt: row.lastOpenedAt } : {}),
      ...(row?.openCount != null ? { openCount: row.openCount } : {}),
      ...(row?.lastGameChatType != null ? { lastGameChatType: row.lastGameChatType } : {}),
    });
    if (syncSeq != null) {
      const cursorRow = await chatLocalDb.chatSyncCursor.get(key);
      await chatLocalDb.chatSyncCursor.put({
        key,
        lastAppliedSeq: Math.max(cursorRow?.lastAppliedSeq ?? 0, syncSeq),
        updatedAt: now,
      });
    }
  });
}

export async function applyThreadTerminal(
  kind: ThreadTerminalKind,
  contextType: ChatContextType,
  contextId: string,
  options?: { syncSeq?: number; archivedAt?: number }
): Promise<void> {
  if (kind === 'invalidate') {
    clearThreadArchivedInMemory(contextType, contextId);
    await purgeLocalDexieThread(contextType, contextId);
    recordChatSyncStaleDispatch();
    dispatchChatSyncStale(contextType, contextId, 'threadInvalidated');
    return;
  }

  const archivedAtMs =
    options?.archivedAt != null && !Number.isNaN(options.archivedAt)
      ? options.archivedAt
      : Date.now();
  if (contextType === 'GAME') {
    socketService.leaveChatRoom('GAME', contextId);
  }
  await dropPendingOutboxForContext(contextType, contextId);
  await persistThreadArchivedMeta(contextType, contextId, archivedAtMs, options?.syncSeq);
}

export async function archiveGameChatLocal(
  gameId: string,
  options?: { syncSeq?: number; archivedAt?: number }
): Promise<void> {
  await applyThreadTerminal('archived', 'GAME', gameId, options);
}

export async function isThreadArchivedLocally(
  contextType: ChatContextType,
  contextId: string
): Promise<boolean> {
  if (isThreadArchivedInMemory(contextType, contextId)) return true;
  const row = await chatLocalDb.chatThreads.get(chatCursorKey(contextType, contextId));
  const archived = row?.archivedAt != null;
  if (archived) markThreadArchivedInMemory(contextType, contextId);
  return archived;
}

export async function hydrateThreadArchivedMemory(
  contextType: ChatContextType,
  contextId: string
): Promise<boolean> {
  return isThreadArchivedLocally(contextType, contextId);
}
