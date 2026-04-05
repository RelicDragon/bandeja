import type { Prisma } from '@prisma/client';
import { ChatContextType, ChatType } from '@prisma/client';

export type ReadCursorMessageSlice = {
  id: string;
  chatContextType: ChatContextType;
  contextId: string;
  chatType: ChatType;
  serverSyncSeq: number | null;
  createdAt: Date;
};

function cmpPos(
  a: { seq: number; at: Date; id: string },
  b: { seq: number; at: Date; id: string }
): number {
  if (a.seq !== b.seq) return a.seq - b.seq;
  const dt = a.at.getTime() - b.at.getTime();
  if (dt !== 0) return dt > 0 ? 1 : -1;
  return a.id.localeCompare(b.id);
}

export function compareChatReadCursorRows(
  a: { readMaxServerSyncSeq: number; readMaxCreatedAt: Date; readMaxMessageId: string },
  b: { readMaxServerSyncSeq: number; readMaxCreatedAt: Date; readMaxMessageId: string }
): number {
  return cmpPos(
    { seq: a.readMaxServerSyncSeq, at: a.readMaxCreatedAt, id: a.readMaxMessageId },
    { seq: b.readMaxServerSyncSeq, at: b.readMaxCreatedAt, id: b.readMaxMessageId }
  );
}

export class ChatReadCursorService {
  static async mergeFromMessage(
    tx: Prisma.TransactionClient,
    userId: string,
    m: ReadCursorMessageSlice
  ): Promise<void> {
    const seq = m.serverSyncSeq ?? -1;
    const key = {
      userId_chatContextType_contextId_chatType: {
        userId,
        chatContextType: m.chatContextType,
        contextId: m.contextId,
        chatType: m.chatType,
      },
    };
    const existing = await tx.chatReadCursor.findUnique({ where: key });
    const cand = { seq, at: m.createdAt, id: m.id };
    if (!existing) {
      await tx.chatReadCursor.create({
        data: {
          userId,
          chatContextType: m.chatContextType,
          contextId: m.contextId,
          chatType: m.chatType,
          readMaxServerSyncSeq: seq,
          readMaxCreatedAt: m.createdAt,
          readMaxMessageId: m.id,
        },
      });
      return;
    }
    const cur = {
      seq: existing.readMaxServerSyncSeq,
      at: existing.readMaxCreatedAt,
      id: existing.readMaxMessageId,
    };
    if (cmpPos(cand, cur) <= 0) return;
    await tx.chatReadCursor.update({
      where: { id: existing.id },
      data: {
        readMaxServerSyncSeq: seq,
        readMaxCreatedAt: m.createdAt,
        readMaxMessageId: m.id,
      },
    });
  }

  static async mergeFromMessages(
    tx: Prisma.TransactionClient,
    userId: string,
    messages: ReadCursorMessageSlice[]
  ): Promise<void> {
    if (messages.length === 0) return;
    const best = new Map<string, ReadCursorMessageSlice>();
    for (const m of messages) {
      const k = `${m.chatContextType}\0${m.contextId}\0${m.chatType}`;
      const prev = best.get(k);
      if (!prev) {
        best.set(k, m);
        continue;
      }
      if (
        cmpPos(
          { seq: m.serverSyncSeq ?? -1, at: m.createdAt, id: m.id },
          { seq: prev.serverSyncSeq ?? -1, at: prev.createdAt, id: prev.id }
        ) > 0
      ) {
        best.set(k, m);
      }
    }
    for (const m of best.values()) {
      await this.mergeFromMessage(tx, userId, m);
    }
  }
}
