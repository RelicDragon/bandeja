import type { ChatContextType } from '@/api/chat';
import { chatApi } from '@/api/chat';
import { chatCursorKey, chatLocalDb } from './chatLocalDb';
import { broadcastChatPullHint } from './chatLocalCoop';

export async function reconcileCursorWithServerHead(
  contextType: ChatContextType,
  contextId: string
): Promise<void> {
  try {
    const head = await chatApi.getChatSyncHead(contextType, contextId);
    const key = chatCursorKey(contextType, contextId);
    const local = (await chatLocalDb.chatSyncCursor.get(key))?.lastAppliedSeq ?? 0;
    if (head > local) {
      if (import.meta.env.DEV) {
        console.warn('[chatSync] server head ahead of applied cursor; scheduling pull', {
          contextType,
          contextId,
          head,
          local,
        });
      }
      broadcastChatPullHint(key);
      void import('./chatSyncScheduler').then((m) =>
        m.enqueueChatSyncPull(contextType, contextId, m.SYNC_PRIORITY_GAP)
      );
    }
  } catch {
    /* offline */
  }
}

export async function bumpCursor(contextType: ChatContextType, contextId: string, seq: number): Promise<void> {
  const key = chatCursorKey(contextType, contextId);
  const row = await chatLocalDb.chatSyncCursor.get(key);
  const next = Math.max(row?.lastAppliedSeq ?? 0, seq);
  await chatLocalDb.chatSyncCursor.put({
    key,
    lastAppliedSeq: next,
    updatedAt: Date.now(),
  });
  broadcastChatPullHint(key);
}

export async function getLocalCursorSeq(
  contextType: ChatContextType,
  contextId: string
): Promise<number> {
  const row = await chatLocalDb.chatSyncCursor.get(chatCursorKey(contextType, contextId));
  return row?.lastAppliedSeq ?? 0;
}

export const getLastAppliedSyncSeq = getLocalCursorSeq;
