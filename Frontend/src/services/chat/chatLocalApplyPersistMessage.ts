import { ChatSyncEventType } from '@bandeja/chat-contract';
import type { ChatMessage } from '@/api/chat';
import {
  isDurableMediaPersist,
  shouldTombstoneMedia,
  toMediaTombstone,
} from './chatMediaPersistTombstone';
import { chatLocalDb, type ChatLocalRow } from './chatLocalDb';
import { putChatLocalRowsWithSearchTokens, putLocalMessageDirect } from './chatLocalApplyWrite';
import { rowFromMessage } from './chatSyncRowUtils';
import type { ChatSyncEventDTO } from './chatSyncEventTypes';

export async function persistLocalMessageDurable(message: ChatMessage): Promise<void> {
  try {
    await putLocalMessageDirect(message);
  } catch (error) {
    if (!shouldTombstoneMedia(message)) throw error;
    const existing = await chatLocalDb.messages.get(message.id);
    if (existing && isDurableMediaPersist(existing.payload)) return;
    await putLocalMessageDirect(toMediaTombstone(message));
  }
}

export async function persistCreatedEventMediaTombstones(
  events: readonly ChatSyncEventDTO[]
): Promise<Array<Pick<ChatMessage, 'id'>>> {
  const incoming: ChatMessage[] = [];
  for (const event of events) {
    if (event.eventType !== ChatSyncEventType.MESSAGE_CREATED) continue;
    const message = (event.payload as { message?: ChatMessage }).message;
    if (!message?.id || !shouldTombstoneMedia(message)) continue;
    incoming.push({
      ...message,
      syncSeq: message.syncSeq ?? event.seq,
      serverSyncSeq: message.serverSyncSeq ?? event.seq,
    });
  }
  if (incoming.length === 0) return [];

  const existingRows = await chatLocalDb.messages.bulkGet(incoming.map((message) => message.id));
  const alreadyDurable: Array<Pick<ChatMessage, 'id'>> = [];
  const rows: ChatLocalRow[] = [];
  const newIds: Array<Pick<ChatMessage, 'id'>> = [];

  for (let i = 0; i < incoming.length; i++) {
    const message = incoming[i]!;
    const existing = existingRows[i];
    if (existing && isDurableMediaPersist(existing.payload)) {
      alreadyDurable.push({ id: message.id });
      continue;
    }
    newIds.push({ id: message.id });
    rows.push(rowFromMessage(toMediaTombstone(message)));
  }

  if (rows.length === 0) return alreadyDurable;
  try {
    await putChatLocalRowsWithSearchTokens(rows);
    return [...alreadyDurable, ...newIds];
  } catch {
    return alreadyDurable;
  }
}
