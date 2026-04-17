import { chatApi } from '@/api/chat';
import type { ChatType } from '@/types';
import { normalizeChatType } from '@/utils/chatType';
import { useAuthStore } from '@/store/authStore';
import { useNetworkStore } from '@/utils/networkStatus';
import { chatLocalDb, type ChatMutationQueueRow } from './chatLocalDb';
import { deleteMutationRow, updateMutationRow } from './chatMutationQueueStorage';
import {
  CHAT_MUTATION_FLUSH_DONE_EVENT,
  CHAT_MUTATION_FLUSH_FAILED_EVENT,
  type ChatMutationFlushFailedDetail,
} from './chatMutationEvents';
import { BANDEJA_CHAT_PINS_UPDATED } from '@/utils/chatPinsEvents';
import { putLocalMessage } from './chatLocalApply';
import { useReactionEmojiUsageStore } from '@/store/reactionEmojiUsageStore';

let flushRunning = false;
let scheduleTimer: ReturnType<typeof setTimeout> | null = null;

function backoffMs(attempts: number): number {
  return Math.min(30_000, 1000 * Math.pow(2, Math.min(attempts, 5)));
}

function shouldDropMutation(status: number | undefined): boolean {
  if (status == null) return false;
  return status === 401 || status === 403;
}

function runWithMutationFlushLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : null;
  if (locks?.request) {
    return new Promise((resolve, reject) => {
      void locks.request('bandeja-chat-mutation-flush-v1', { mode: 'exclusive' }, async () => {
        try {
          resolve(await fn());
        } catch (e) {
          reject(e);
        }
      });
    });
  }
  return fn();
}

function dispatchPinHint(row: ChatMutationQueueRow): void {
  const ct = row.payload.chatType as string | undefined;
  if (ct && typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(BANDEJA_CHAT_PINS_UPDATED, {
        detail: {
          contextType: row.contextType,
          contextId: row.contextId,
          chatType: normalizeChatType(ct as ChatType),
        },
      })
    );
  }
}

async function executeMutation(row: ChatMutationQueueRow): Promise<void> {
  const mid = row.messageId;
  const cid = row.clientMutationId;
  switch (row.kind) {
    case 'edit': {
      if (!mid) throw new Error('missing messageId');
      const { content, mentionIds } = row.payload as { content: string; mentionIds: string[] };
      const updated = await chatApi.editMessage(mid, { content, mentionIds, clientMutationId: cid });
      void putLocalMessage(updated);
      break;
    }
    case 'delete': {
      if (!mid) throw new Error('missing messageId');
      await chatApi.deleteMessage(mid, cid);
      break;
    }
    case 'reaction_add': {
      if (!mid) throw new Error('missing messageId');
      const { emoji } = row.payload as { emoji: string };
      const r = await chatApi.addReaction(mid, { emoji, clientMutationId: cid });
      useReactionEmojiUsageStore.getState().applyFromMutation(r.emojiUsage);
      break;
    }
    case 'reaction_remove': {
      if (!mid) throw new Error('missing messageId');
      await chatApi.removeReaction(mid, cid);
      break;
    }
    case 'pin': {
      if (!mid) throw new Error('missing messageId');
      await chatApi.pinMessage(mid, cid);
      dispatchPinHint(row);
      break;
    }
    case 'unpin': {
      if (!mid) throw new Error('missing messageId');
      await chatApi.unpinMessage(mid, cid);
      dispatchPinHint(row);
      break;
    }
    case 'mark_read_batch': {
      const p = row.payload as { target: string; chatTypes?: ChatType[] };
      if (p.target === 'group_channel') {
        await chatApi.markGroupChannelAsRead(row.contextId);
      } else {
        await chatApi.markAllMessagesAsReadForContext(row.contextType, row.contextId, p.chatTypes);
      }
      break;
    }
    default:
      throw new Error(`unknown mutation kind ${(row as ChatMutationQueueRow).kind}`);
  }
}

export function scheduleChatMutationFlush(): void {
  if (scheduleTimer) clearTimeout(scheduleTimer);
  scheduleTimer = setTimeout(() => {
    scheduleTimer = null;
    void flushChatMutationQueue();
  }, 220);
}

export async function flushChatMutationQueue(): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  if (!useNetworkStore.getState().isOnline) return;
  if (!useAuthStore.getState().isAuthenticated) return;

  await runWithMutationFlushLock(async () => {
    if (flushRunning) return;
    flushRunning = true;
    try {
      const rows = await chatLocalDb.mutationQueue.toArray();
      const now = Date.now();
      const pending = rows
        .filter(
          (r) =>
            r.status === 'queued' ||
            (r.status === 'failed' && (r.nextRetryAt == null || r.nextRetryAt <= now))
        )
        .sort((a, b) => a.createdAt - b.createdAt);

      for (const row of pending) {
        await updateMutationRow(row.id, { status: 'sending' });
        try {
          await executeMutation(row);
          await deleteMutationRow(row.id);
        } catch (e) {
          const status = (e as { response?: { status?: number } })?.response?.status;
          const msg = e instanceof Error ? e.message : String(e);
          if (status === 404 || shouldDropMutation(status)) {
            await deleteMutationRow(row.id);
            continue;
          }
          if (status === 409) {
            await updateMutationRow(row.id, {
              status: 'queued',
              nextRetryAt: Date.now() + 1800,
            });
            continue;
          }
          const attempts = row.attempts + 1;
          await updateMutationRow(row.id, {
            status: 'failed',
            attempts,
            lastError: msg,
            nextRetryAt: Date.now() + backoffMs(attempts),
          });
          if (typeof window !== 'undefined') {
            const detail: ChatMutationFlushFailedDetail = {
              contextType: row.contextType,
              contextId: row.contextId,
              mutationId: row.id,
              kind: row.kind,
              error: msg,
            };
            window.dispatchEvent(new CustomEvent(CHAT_MUTATION_FLUSH_FAILED_EVENT, { detail }));
          }
        }
      }
    } finally {
      flushRunning = false;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(CHAT_MUTATION_FLUSH_DONE_EVENT));
      }
    }
  });
}

export function scheduleRetryFailedChatMutations(): void {
  scheduleChatMutationFlush();
}
