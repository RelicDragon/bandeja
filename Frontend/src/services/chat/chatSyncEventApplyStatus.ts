import { ChatSyncEventType } from '@bandeja/chat-contract';
import type { ChatMessage } from '@/api/chat';
import type { SeqApplyDecision } from './chatAppliedSeq';
import { mediaUrlCount } from './chatMediaPersistTombstone';
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
    const stored = persistedById.get(message.id);
    if (!stored) return false;
    if (mediaUrlCount(message) > 0 && mediaUrlCount(stored) === 0) return false;
    return true;
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
