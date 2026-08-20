import { ChatSyncEventType } from '@bandeja/chat-contract';
import type { ChatMessage } from '@/api/chat';
import type { SeqApplyDecision } from './chatAppliedSeq';
import type { ChatSyncEventDTO } from './chatSyncEventTypes';

function createdMessage(event: ChatSyncEventDTO): ChatMessage | undefined {
  const payload = event.payload as { message?: ChatMessage };
  return payload.message;
}

export function isSyncEventApplied(
  event: ChatSyncEventDTO,
  persistedById: ReadonlyMap<string, ChatMessage>
): boolean {
  if (event.eventType === ChatSyncEventType.MESSAGE_CREATED) {
    const message = createdMessage(event);
    if (!message?.id) return false;
    return persistedById.has(message.id);
  }
  return true;
}

export function seqApplyDecisionsForEvents(
  events: readonly ChatSyncEventDTO[],
  persistedMessages: readonly ChatMessage[]
): SeqApplyDecision[] {
  const persistedById = new Map(persistedMessages.map((message) => [message.id, message]));
  return events.map((event) => ({
    seq: event.seq,
    applied: isSyncEventApplied(event, persistedById),
  }));
}

/** Failed-slice catch path: only media creates that were tombstoned count as applied. */
export function seqApplyDecisionsForTombstonedCreates(
  events: readonly ChatSyncEventDTO[],
  tombstonedMessages: readonly Pick<ChatMessage, 'id'>[]
): SeqApplyDecision[] {
  const tombstonedIds = new Set(tombstonedMessages.map((message) => message.id));
  return events.map((event) => {
    if (event.eventType !== ChatSyncEventType.MESSAGE_CREATED) {
      return { seq: event.seq, applied: false };
    }
    const message = createdMessage(event);
    return { seq: event.seq, applied: Boolean(message?.id && tombstonedIds.has(message.id)) };
  });
}
