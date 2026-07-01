import { chatApi, type ChatContextType, type MessageReaction } from '@/api/chat';
import type { ChatType } from '@/types';
import {
  applyLocalMessageEditOptimistic,
  applyLocalReactionOptimisticReplace,
  markLocalMessageDeleted,
} from '../chatLocalApply';
import {
  deleteMutationRow,
  newClientMutationId,
  pruneMutationsForMessageBeforeDelete,
  putMutationRow,
  updateMutationRow,
} from '../chatMutationQueueStorage';
import type { ChatMarkReadMutationPayload } from './types';
import { normalizeChatType } from '@/utils/chatType';
import { useAuthStore } from '@/store/authStore';
import { useNetworkStore } from '@/utils/networkStatus';
import { chatLocalDb, type ChatMutationQueueRow } from '../chatLocalDb';
import {
  CHAT_MUTATION_FLUSH_DONE_EVENT,
  CHAT_MUTATION_FLUSH_FAILED_EVENT,
  type ChatMutationFlushFailedDetail,
} from '../chatMutationEvents';
import { BANDEJA_CHAT_PINS_UPDATED } from '@/utils/chatPinsEvents';
import { putLocalMessage } from '../chatLocalApply';
import { useReactionEmojiUsageStore } from '@/store/reactionEmojiUsageStore';
import { onMarkReadBatchFlushSuccess } from '@/services/chat/unreadCoordinator';
import { contextKey, type SnapshotContextType } from '@/services/chat/unreadSnapshot';
import type { PendingOfflineIntent } from './types';

function baseRow(
  kind: ChatMutationQueueRow['kind'],
  contextType: ChatContextType,
  contextId: string,
  messageId: string | undefined,
  payload: Record<string, unknown>
): ChatMutationQueueRow {
  return {
    id: newClientMutationId(),
    kind,
    contextType,
    contextId,
    messageId,
    payload,
    clientMutationId: newClientMutationId(),
    status: 'queued',
    createdAt: Date.now(),
    attempts: 0,
  };
}

export async function enqueueEdit(params: {
  contextType: ChatContextType;
  contextId: string;
  messageId: string;
  content: string;
  mentionIds: string[];
}): Promise<void> {
  const { contextType, contextId, messageId, content, mentionIds } = params;
  const row = baseRow('edit', contextType, contextId, messageId, { content, mentionIds });
  await putMutationRow(row);
  try {
    await applyLocalMessageEditOptimistic(messageId, { content, mentionIds });
  } catch (e) {
    await deleteMutationRow(row.id);
    throw e;
  }
}

export async function enqueueDelete(params: {
  contextType: ChatContextType;
  contextId: string;
  messageId: string;
}): Promise<void> {
  const { contextType, contextId, messageId } = params;
  await pruneMutationsForMessageBeforeDelete(messageId);
  const row = baseRow('delete', contextType, contextId, messageId, {});
  await putMutationRow(row);
  try {
    await markLocalMessageDeleted(messageId);
  } catch (e) {
    await deleteMutationRow(row.id);
    throw e;
  }
}

export async function enqueueReactionAdd(params: {
  contextType: ChatContextType;
  contextId: string;
  messageId: string;
  nextReactions: MessageReaction[];
  emoji: string;
  userId: string;
}): Promise<void> {
  const { contextType, contextId, messageId, nextReactions, emoji, userId } = params;
  const row = baseRow('reaction_add', contextType, contextId, messageId, { emoji, userId });
  await putMutationRow(row);
  try {
    await applyLocalReactionOptimisticReplace(messageId, nextReactions);
  } catch (e) {
    await deleteMutationRow(row.id);
    throw e;
  }
}

export async function enqueueReactionRemove(params: {
  contextType: ChatContextType;
  contextId: string;
  messageId: string;
  nextReactions: MessageReaction[];
  userId: string;
}): Promise<void> {
  const { contextType, contextId, messageId, nextReactions, userId } = params;
  const row = baseRow('reaction_remove', contextType, contextId, messageId, { userId });
  await putMutationRow(row);
  try {
    await applyLocalReactionOptimisticReplace(messageId, nextReactions);
  } catch (e) {
    await deleteMutationRow(row.id);
    throw e;
  }
}

export async function enqueuePin(params: {
  contextType: ChatContextType;
  contextId: string;
  messageId: string;
  chatType: ChatType;
}): Promise<void> {
  const { contextType, contextId, messageId, chatType } = params;
  const row = baseRow('pin', contextType, contextId, messageId, { chatType });
  await putMutationRow(row);
}

export async function enqueueUnpin(params: {
  contextType: ChatContextType;
  contextId: string;
  messageId: string;
  chatType: ChatType;
}): Promise<void> {
  const { contextType, contextId, messageId, chatType } = params;
  const row = baseRow('unpin', contextType, contextId, messageId, { chatType });
  await putMutationRow(row);
}

export async function enqueueMarkReadBatch(params: {
  contextType: ChatContextType;
  contextId: string;
  payload: ChatMarkReadMutationPayload;
}): Promise<void> {
  const { contextType, contextId, payload } = params;
  const clientOpId = payload.clientOpId?.trim() || newClientMutationId();
  const all = await chatLocalDb.mutationQueue.toArray();
  await Promise.all(
    all
      .filter(
        (r) =>
          r.kind === 'mark_read_batch' && r.contextType === contextType && r.contextId === contextId
      )
      .map((r) => chatLocalDb.mutationQueue.delete(r.id))
  );
  const row: ChatMutationQueueRow = {
    ...baseRow('mark_read_batch', contextType, contextId, undefined, {
      ...payload,
      clientOpId,
    } as Record<string, unknown>),
    clientMutationId: clientOpId,
  };
  await putMutationRow(row);
}

function backoffMs(attempts: number): number {
  return Math.min(30_000, 1000 * Math.pow(2, Math.min(attempts, 5)));
}

function shouldDropMutation(status: number | undefined): boolean {
  if (status == null) return false;
  return status === 401 || status === 403;
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
      const p = row.payload as { target: string; chatTypes?: ChatType[]; clientOpId?: string };
      const snapshotType = row.contextType as SnapshotContextType;
      const clientOpId = (p.clientOpId ?? row.clientMutationId).trim();
      const response = await chatApi.markContextRead({
        contextType: snapshotType,
        contextId: row.contextId,
        gameChatTypes: p.chatTypes,
        clientOpId: clientOpId.length > 0 ? clientOpId : undefined,
      });
      onMarkReadBatchFlushSuccess(contextKey(snapshotType, row.contextId), response.data);
      break;
    }
    default:
      throw new Error(`unknown mutation kind ${(row as ChatMutationQueueRow).kind}`);
  }
}

export async function listPendingMutationIntents(): Promise<PendingOfflineIntent[]> {
  const rows = await chatLocalDb.mutationQueue.toArray();
  const now = Date.now();
  return rows
    .filter(
      (r) =>
        r.status === 'queued' ||
        (r.status === 'failed' && (r.nextRetryAt == null || r.nextRetryAt <= now))
    )
    .map((r) => ({
      source: 'mutation' as const,
      id: r.id,
      contextType: r.contextType,
      contextId: r.contextId,
      createdAtMs: r.createdAt,
    }));
}

export async function flushMutationIntent(mutationId: string): Promise<void> {
  const row = await chatLocalDb.mutationQueue.get(mutationId);
  if (!row) return;
  await updateMutationRow(row.id, { status: 'sending' });
  try {
    await executeMutation(row);
    await deleteMutationRow(row.id);
  } catch (e) {
    const status = (e as { response?: { status?: number } })?.response?.status;
    const msg = e instanceof Error ? e.message : String(e);
    if (status === 404 || shouldDropMutation(status)) {
      await deleteMutationRow(row.id);
      return;
    }
    if (status === 409) {
      await updateMutationRow(row.id, {
        status: 'queued',
        nextRetryAt: Date.now() + 1800,
      });
      return;
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

export function canFlushMutations(): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
  if (!useNetworkStore.getState().isOnline) return false;
  if (!useAuthStore.getState().isAuthenticated) return false;
  return true;
}

export function dispatchMutationFlushDone(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CHAT_MUTATION_FLUSH_DONE_EVENT));
  }
}

export { countFailedMutationsForContext } from '../chatMutationQueueStorage';
