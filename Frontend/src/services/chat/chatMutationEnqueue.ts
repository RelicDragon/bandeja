import type { ChatContextType, MessageReaction } from '@/api/chat';
import type { ChatType } from '@/types';
import {
  applyLocalMessageEditOptimistic,
  applyLocalReactionOptimisticReplace,
  markLocalMessageDeleted,
} from './chatLocalApply';
import {
  deleteMutationRow,
  newClientMutationId,
  pruneMutationsForMessageBeforeDelete,
  putMutationRow,
} from './chatMutationQueueStorage';
import { scheduleChatMutationFlush } from './chatMutationFlush';
import { chatLocalDb, type ChatMutationQueueRow } from './chatLocalDb';

/* Ordering: FIFO. Delete supersedes prior queued edit/reaction/pin/unpin for the same message (see pruneMutationsForMessageBeforeDelete). Server text is authoritative after ack; reactions merge per user. */

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

export async function enqueueChatMutationEdit(params: {
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
  scheduleChatMutationFlush();
}

export async function enqueueChatMutationDelete(params: {
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
  scheduleChatMutationFlush();
}

export async function enqueueChatMutationReactionAdd(params: {
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
  scheduleChatMutationFlush();
}

export async function enqueueChatMutationReactionRemove(params: {
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
  scheduleChatMutationFlush();
}

export async function enqueueChatMutationPin(params: {
  contextType: ChatContextType;
  contextId: string;
  messageId: string;
  chatType: ChatType;
}): Promise<void> {
  const { contextType, contextId, messageId, chatType } = params;
  const row = baseRow('pin', contextType, contextId, messageId, { chatType });
  await putMutationRow(row);
  scheduleChatMutationFlush();
}

export async function enqueueChatMutationUnpin(params: {
  contextType: ChatContextType;
  contextId: string;
  messageId: string;
  chatType: ChatType;
}): Promise<void> {
  const { contextType, contextId, messageId, chatType } = params;
  const row = baseRow('unpin', contextType, contextId, messageId, { chatType });
  await putMutationRow(row);
  scheduleChatMutationFlush();
}

export type ChatMarkReadMutationPayload =
  | { target: 'context'; chatTypes?: ChatType[] }
  | { target: 'group_channel' };

export async function enqueueChatMutationMarkReadBatch(params: {
  contextType: ChatContextType;
  contextId: string;
  payload: ChatMarkReadMutationPayload;
}): Promise<void> {
  const { contextType, contextId, payload } = params;
  const all = await chatLocalDb.mutationQueue.toArray();
  await Promise.all(
    all
      .filter(
        (r) =>
          r.kind === 'mark_read_batch' && r.contextType === contextType && r.contextId === contextId
      )
      .map((r) => chatLocalDb.mutationQueue.delete(r.id))
  );
  const row = baseRow('mark_read_batch', contextType, contextId, undefined, payload as Record<string, unknown>);
  await putMutationRow(row);
  scheduleChatMutationFlush();
}
