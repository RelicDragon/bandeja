import { ChatSyncEventType } from '@bandeja/chat-contract';
import type { ChatContextType } from '@prisma/client';
import { ChatSyncEventService, type SyncTransactionClient } from './chatSyncEvent.service';
import type { MergeReadCursorResult } from './chatReadCursor.service';

export type ReadCursorUpdatePayload = {
  userId: string;
  chatContextType: ChatContextType;
  contextId: string;
  chatType: string;
  readMaxServerSyncSeq: number;
  readMaxCreatedAt: string;
  readMaxMessageId: string;
  updatedAt: string;
};

export function readCursorUpdatePayloadFromMerge(
  result: Extract<MergeReadCursorResult, { advanced: true }>
): ReadCursorUpdatePayload {
  const c = result.cursor;
  return {
    userId: c.userId,
    chatContextType: c.chatContextType,
    contextId: c.contextId,
    chatType: c.chatType,
    readMaxServerSyncSeq: c.readMaxServerSyncSeq,
    readMaxCreatedAt: c.readMaxCreatedAt.toISOString(),
    readMaxMessageId: c.readMaxMessageId,
    updatedAt: c.updatedAt.toISOString(),
  };
}

export async function appendReadCursorUpdatesInTransaction(
  tx: SyncTransactionClient,
  results: MergeReadCursorResult[]
): Promise<number | undefined> {
  let syncSeq: number | undefined;
  for (const result of results) {
    if (!result.advanced) continue;
    const payload = readCursorUpdatePayloadFromMerge(result);
    syncSeq = await ChatSyncEventService.appendEventInTransaction(
      tx,
      payload.chatContextType,
      payload.contextId,
      ChatSyncEventType.READ_CURSOR_UPDATE,
      payload
    );
  }
  return syncSeq;
}
