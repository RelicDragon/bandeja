import type { Prisma } from '@prisma/client';
import { ChatContextType, ChatType, Prisma as PrismaNS } from '@prisma/client';
import prisma from '../../config/database';

export type ReadCursorMessageSlice = {
  id: string;
  chatContextType: ChatContextType;
  contextId: string;
  chatType: ChatType;
  serverSyncSeq: number | null;
  createdAt: Date;
};

export type ChatReadCursorPosition = {
  readMaxServerSyncSeq: number;
  readMaxCreatedAt: Date;
  readMaxMessageId: string;
};

export type PeerReadCursor = {
  userId: string;
  chatContextType: ChatContextType;
  contextId: string;
  chatType: ChatType;
  readMaxServerSyncSeq: number;
  readMaxCreatedAt: Date;
  readMaxMessageId: string;
  updatedAt: Date;
};

export type MaxPeerReadCursor = {
  chatContextType: ChatContextType;
  contextId: string;
  chatType: ChatType;
  readMaxServerSyncSeq: number;
  readMaxCreatedAt: Date;
  readMaxMessageId: string;
  updatedAt: Date;
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

export type MergeReadCursorResult =
  | { advanced: false }
  | {
      advanced: true;
      cursor: ChatReadCursorPosition & {
        userId: string;
        chatContextType: ChatContextType;
        contextId: string;
        chatType: ChatType;
        updatedAt: Date;
      };
    };

type LockedCursorRow = {
  id: string;
  userId: string;
  chatContextType: ChatContextType;
  contextId: string;
  chatType: ChatType;
  readMaxServerSyncSeq: number;
  readMaxCreatedAt: Date;
  readMaxMessageId: string;
  updatedAt: Date;
};

function toMergeAdvanced(row: LockedCursorRow): MergeReadCursorResult {
  return {
    advanced: true,
    cursor: {
      userId: row.userId,
      chatContextType: row.chatContextType,
      contextId: row.contextId,
      chatType: row.chatType,
      readMaxServerSyncSeq: row.readMaxServerSyncSeq,
      readMaxCreatedAt: row.readMaxCreatedAt,
      readMaxMessageId: row.readMaxMessageId,
      updatedAt: row.updatedAt,
    },
  };
}

export class ChatReadCursorService {
  static async mergeFromMessage(
    tx: Prisma.TransactionClient,
    userId: string,
    m: ReadCursorMessageSlice
  ): Promise<MergeReadCursorResult> {
    const seq = m.serverSyncSeq ?? -1;
    const cand = { seq, at: m.createdAt, id: m.id };

    const locked = await tx.$queryRaw<LockedCursorRow[]>`
      SELECT
        id,
        "userId",
        "chatContextType",
        "contextId",
        "chatType",
        "readMaxServerSyncSeq",
        "readMaxCreatedAt",
        "readMaxMessageId",
        "updatedAt"
      FROM "ChatReadCursor"
      WHERE "userId" = ${userId}
        AND "chatContextType" = ${m.chatContextType}::"ChatContextType"
        AND "contextId" = ${m.contextId}
        AND "chatType" = ${m.chatType}::"ChatType"
      FOR UPDATE
    `;

    const existing = locked[0];
    if (!existing) {
      try {
        const created = await tx.chatReadCursor.create({
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
        return toMergeAdvanced(created);
      } catch (e) {
        if (
          e instanceof PrismaNS.PrismaClientKnownRequestError &&
          e.code === 'P2002'
        ) {
          return this.mergeFromMessage(tx, userId, m);
        }
        throw e;
      }
    }

    const cur = {
      seq: existing.readMaxServerSyncSeq,
      at: existing.readMaxCreatedAt,
      id: existing.readMaxMessageId,
    };
    if (cmpPos(cand, cur) <= 0) return { advanced: false };

    const updated = await tx.chatReadCursor.update({
      where: { id: existing.id },
      data: {
        readMaxServerSyncSeq: seq,
        readMaxCreatedAt: m.createdAt,
        readMaxMessageId: m.id,
      },
    });
    return toMergeAdvanced(updated);
  }

  static async mergeFromMessages(
    tx: Prisma.TransactionClient,
    userId: string,
    messages: ReadCursorMessageSlice[]
  ): Promise<MergeReadCursorResult[]> {
    if (messages.length === 0) return [];
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
    const results: MergeReadCursorResult[] = [];
    for (const m of best.values()) {
      results.push(await this.mergeFromMessage(tx, userId, m));
    }
    return results;
  }

  static async listPeerCursors(
    chatContextType: ChatContextType,
    contextId: string,
    chatType: ChatType,
    excludeUserId: string
  ): Promise<PeerReadCursor[]> {
    const rows = await prisma.chatReadCursor.findMany({
      where: {
        chatContextType,
        contextId,
        chatType,
        userId: { not: excludeUserId },
      },
      select: {
        userId: true,
        chatContextType: true,
        contextId: true,
        chatType: true,
        readMaxServerSyncSeq: true,
        readMaxCreatedAt: true,
        readMaxMessageId: true,
        updatedAt: true,
      },
    });
    return rows;
  }

  static maxPeerCursorFromPeers(
    peers: PeerReadCursor[],
    thread: { chatContextType: ChatContextType; contextId: string; chatType: ChatType }
  ): MaxPeerReadCursor | null {
    if (peers.length === 0) return null;
    let best = peers[0]!;
    for (let i = 1; i < peers.length; i++) {
      const p = peers[i]!;
      if (compareChatReadCursorRows(p, best) > 0) best = p;
    }
    return {
      chatContextType: thread.chatContextType,
      contextId: thread.contextId,
      chatType: thread.chatType,
      readMaxServerSyncSeq: best.readMaxServerSyncSeq,
      readMaxCreatedAt: best.readMaxCreatedAt,
      readMaxMessageId: best.readMaxMessageId,
      updatedAt: best.updatedAt,
    };
  }

  static async getMaxPeerCursor(
    chatContextType: ChatContextType,
    contextId: string,
    chatType: ChatType,
    excludeUserId: string
  ): Promise<MaxPeerReadCursor | null> {
    const peers = await this.listPeerCursors(chatContextType, contextId, chatType, excludeUserId);
    return this.maxPeerCursorFromPeers(peers, { chatContextType, contextId, chatType });
  }
}
