import { ChatSyncEventType } from '@bandeja/chat-contract';
import type { ChatMessage } from '@/api/chat';
import { shouldTombstoneMedia, toMediaTombstone } from './chatMediaPersistTombstone';
import { putChatLocalRowsWithSearchTokens, putLocalMessageDirect } from './chatLocalApplyWrite';
import { rowFromMessage } from './chatSyncRowUtils';
import type { ChatSyncEventDTO } from './chatSyncEventTypes';

export async function persistLocalMessageDurable(message: ChatMessage): Promise<void> {
  try {
    await putLocalMessageDirect(message);
  } catch (error) {
    if (!shouldTombstoneMedia(message)) throw error;
    await putLocalMessageDirect(toMediaTombstone(message));
  }
}

export async function persistCreatedEventMediaTombstones(
  events: readonly ChatSyncEventDTO[]
): Promise<Array<Pick<ChatMessage, 'id'>>> {
  const tombstones: ChatMessage[] = [];
  const rows = [];
  for (const event of events) {
    if (event.eventType !== ChatSyncEventType.MESSAGE_CREATED) continue;
    const message = (event.payload as { message?: ChatMessage }).message;
    if (!message?.id || !shouldTombstoneMedia(message)) continue;
    const tombstone = toMediaTombstone({
      ...message,
      syncSeq: message.syncSeq ?? event.seq,
      serverSyncSeq: message.serverSyncSeq ?? event.seq,
    });
    tombstones.push(tombstone);
    rows.push(rowFromMessage(tombstone));
  }
  if (rows.length === 0) return [];
  await putChatLocalRowsWithSearchTokens(rows);
  return tombstones;
}
