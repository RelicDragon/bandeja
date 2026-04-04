import { ChatContextType, ChatSyncEventType, Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import prisma from '../../config/database';
import { chatSyncJsonValue } from './chatSyncJson';

const MAX_SYNC_PAGE = 500;

export type SyncTransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends' | '$use'
>;

export class ChatSyncEventService {
  static async appendEventInTransaction(
    tx: SyncTransactionClient,
    contextType: ChatContextType,
    contextId: string,
    eventType: ChatSyncEventType,
    payload: unknown
  ): Promise<number> {
    const json = chatSyncJsonValue(payload);
    const rows = await tx.$queryRaw<Array<{ maxSeq: number }>>(
      Prisma.sql`
        INSERT INTO "ConversationSyncState" ("contextType", "contextId", "maxSeq")
        VALUES (${contextType}::"ChatContextType", ${contextId}, 1)
        ON CONFLICT ("contextType", "contextId")
        DO UPDATE SET "maxSeq" = "ConversationSyncState"."maxSeq" + 1
        RETURNING "maxSeq"
      `
    );
    const seq = Number(rows[0]?.maxSeq);
    if (!Number.isFinite(seq)) {
      throw new Error('ChatSyncEventService: failed to allocate seq');
    }
    await tx.chatSyncEvent.create({
      data: {
        contextType,
        contextId,
        seq,
        eventType,
        payload: json,
      },
    });
    return seq;
  }

  static async appendEvent(
    contextType: ChatContextType,
    contextId: string,
    eventType: ChatSyncEventType,
    payload: unknown
  ): Promise<number> {
    return prisma.$transaction((tx) =>
      this.appendEventInTransaction(tx, contextType, contextId, eventType, payload)
    );
  }

  static async getHeadSeq(contextType: ChatContextType, contextId: string): Promise<number> {
    const row = await prisma.conversationSyncState.findUnique({
      where: { contextType_contextId: { contextType, contextId } },
      select: { maxSeq: true },
    });
    return row?.maxSeq ?? 0;
  }

  /** Lowest seq still stored for this context; null if no event rows. */
  static async getOldestRetainedSeq(
    contextType: ChatContextType,
    contextId: string
  ): Promise<number | null> {
    const row = await prisma.chatSyncEvent.findFirst({
      where: { contextType, contextId },
      orderBy: { seq: 'asc' },
      select: { seq: true },
    });
    return row?.seq ?? null;
  }

  static async getEventsAfter(
    contextType: ChatContextType,
    contextId: string,
    afterSeq: number,
    limit: number
  ) {
    const take = Math.min(Math.max(1, limit), MAX_SYNC_PAGE);
    return prisma.chatSyncEvent.findMany({
      where: {
        contextType,
        contextId,
        seq: { gt: afterSeq },
      },
      orderBy: { seq: 'asc' },
      take,
    });
  }

  static async getHeadsForContexts(items: Array<{ contextType: ChatContextType; contextId: string }>) {
    const map: Record<string, number> = {};
    if (items.length === 0) return map;
    const unique = new Map<string, { contextType: ChatContextType; contextId: string }>();
    for (const it of items) {
      unique.set(`${it.contextType}:${it.contextId}`, it);
    }
    const list = Array.from(unique.values());
    const rows = await prisma.conversationSyncState.findMany({
      where: {
        OR: list.map((i) => ({
          contextType: i.contextType,
          contextId: i.contextId,
        })),
      },
      select: { contextType: true, contextId: true, maxSeq: true },
    });
    for (const r of rows) {
      map[`${r.contextType}:${r.contextId}`] = r.maxSeq;
    }
    for (const i of list) {
      const k = `${i.contextType}:${i.contextId}`;
      if (map[k] === undefined) map[k] = 0;
    }
    return map;
  }

  static async pruneEventsOlderThanDays(days: number): Promise<number> {
    if (days <= 0) return 0;
    const cutoff = new Date(Date.now() - days * 86_400_000);
    const result = await prisma.chatSyncEvent.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    return result.count;
  }
}
