import type { ChatMessage, MessageReaction, MessageReadReceipt } from '@/api/chat';
import { chatLocalDb } from './chatLocalDb';
import { enqueueChatLocalContextApply } from './chatLocalApplyQueue';
import { mergeReactionListSync } from '@/services/chat/chatSyncEventsToPatches';
import { rowFromMessage } from '@/services/chat/chatSyncRowUtils';
import { putChatLocalRowsWithSearchTokens } from './chatLocalApplyWrite';

export async function patchLocalTranscriptionDirect(
  messageId: string,
  audioTranscription: NonNullable<ChatMessage['audioTranscription']>
): Promise<void> {
  const row = await chatLocalDb.messages.get(messageId);
  if (!row) return;
  await putChatLocalRowsWithSearchTokens([rowFromMessage({ ...row.payload, audioTranscription })]);
}

export async function patchLocalTranscription(
  messageId: string,
  audioTranscription: NonNullable<ChatMessage['audioTranscription']>
): Promise<void> {
  const row = await chatLocalDb.messages.get(messageId);
  if (!row) return;
  return enqueueChatLocalContextApply(row.contextType, row.contextId, () =>
    patchLocalTranscriptionDirect(messageId, audioTranscription)
  );
}

export async function patchLocalReadReceiptDirect(readReceipt: {
  messageId: string;
  userId: string;
  readAt: string;
}): Promise<void> {
  const row = await chatLocalDb.messages.get(readReceipt.messageId);
  if (!row) return;
  const receipts = row.payload.readReceipts ?? [];
  const others = receipts.filter((r) => r.userId !== readReceipt.userId);
  const next: MessageReadReceipt = {
    id: `sock-${readReceipt.messageId}-${readReceipt.userId}`,
    messageId: readReceipt.messageId,
    userId: readReceipt.userId,
    readAt: readReceipt.readAt,
  };
  await putChatLocalRowsWithSearchTokens([rowFromMessage({ ...row.payload, readReceipts: [...others, next] })]);
}

export async function patchLocalReadReceipt(readReceipt: {
  messageId: string;
  userId: string;
  readAt: string;
}): Promise<void> {
  const row = await chatLocalDb.messages.get(readReceipt.messageId);
  if (!row) return;
  return enqueueChatLocalContextApply(row.contextType, row.contextId, () => patchLocalReadReceiptDirect(readReceipt));
}

export async function patchLocalPollDirect(messageId: string, poll: NonNullable<ChatMessage['poll']>): Promise<void> {
  const row = await chatLocalDb.messages.get(messageId);
  if (!row) return;
  await putChatLocalRowsWithSearchTokens([rowFromMessage({ ...row.payload, poll })]);
}

export async function patchLocalPoll(messageId: string, poll: NonNullable<ChatMessage['poll']>): Promise<void> {
  const row = await chatLocalDb.messages.get(messageId);
  if (!row) return;
  return enqueueChatLocalContextApply(row.contextType, row.contextId, () => patchLocalPollDirect(messageId, poll));
}

export async function persistReactionSocketPayloadDirect(reaction: {
  messageId?: string;
  userId?: string;
  action?: string;
  emoji?: string;
  id?: string;
  createdAt?: string;
  user?: MessageReaction['user'];
}): Promise<void> {
  if (!reaction.messageId) return;
  if (reaction.action === 'removed' && reaction.userId) {
    const row = await chatLocalDb.messages.get(reaction.messageId);
    if (!row) return;
    const reactions = (row.payload.reactions ?? []).filter((r) => r.userId !== reaction.userId);
    await putChatLocalRowsWithSearchTokens([rowFromMessage({ ...row.payload, reactions })]);
    return;
  }
  if (!reaction.userId || !reaction.emoji) return;
  const full: MessageReaction = {
    id: reaction.id ?? `tmp-${reaction.messageId}-${reaction.userId}`,
    messageId: reaction.messageId,
    userId: reaction.userId,
    emoji: reaction.emoji,
    createdAt: reaction.createdAt ?? new Date().toISOString(),
    user: (reaction.user ?? { id: reaction.userId, firstName: '', lastName: '' }) as MessageReaction['user'],
  };
  const row = await chatLocalDb.messages.get(reaction.messageId);
  if (!row) return;
  const reactions = mergeReactionListSync(row.payload.reactions ?? [], full);
  await putChatLocalRowsWithSearchTokens([rowFromMessage({ ...row.payload, reactions })]);
}

export async function persistReactionSocketPayload(reaction: {
  messageId?: string;
  userId?: string;
  action?: string;
  emoji?: string;
  id?: string;
  createdAt?: string;
  user?: MessageReaction['user'];
}): Promise<void> {
  if (!reaction.messageId) return;
  const row = await chatLocalDb.messages.get(reaction.messageId);
  if (!row) return;
  return enqueueChatLocalContextApply(row.contextType, row.contextId, () =>
    persistReactionSocketPayloadDirect(reaction)
  );
}
