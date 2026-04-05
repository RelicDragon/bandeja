import { ChatType, Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { sqlMessageNotReadByUser } from './chatReadUnreadSql';

export type UnreadCountMap = Record<string, number>;

const IN_CLAUSE_BATCH_SIZE = 500;

export class UnreadCountBatchService {
  static async getUnreadCountsByContext(
    chatContextType: 'USER' | 'BUG' | 'GROUP',
    contextIds: string[],
    userId: string
  ): Promise<UnreadCountMap> {
    if (contextIds.length === 0) return {};

    const map: UnreadCountMap = {};
    for (let i = 0; i < contextIds.length; i += IN_CLAUSE_BATCH_SIZE) {
      const batch = contextIds.slice(i, i + IN_CLAUSE_BATCH_SIZE);
      const result = await prisma.$queryRaw<Array<{ contextId: string; cnt: bigint }>>(
        Prisma.sql`
        SELECT m."contextId", COUNT(*)::bigint as cnt
        FROM "ChatMessage" m
        WHERE m."chatContextType"::text = ${chatContextType}
          AND m."deletedAt" IS NULL
          AND m."senderId" IS NOT NULL AND m."senderId" != ${userId}
          AND m."contextId" IN (${Prisma.join(batch)})
          AND ${sqlMessageNotReadByUser(userId)}
        GROUP BY m."contextId"
      `
      );
      for (const row of result) {
        map[row.contextId] = Number(row.cnt);
      }
    }
    return map;
  }

  static async getGameUnreadCountsByContextAndType(
    gameIds: string[],
    userId: string
  ): Promise<Array<{ context_id: string; chat_type: string; cnt: bigint }>> {
    if (gameIds.length === 0) return [];
    const batches: string[][] = [];
    for (let i = 0; i < gameIds.length; i += IN_CLAUSE_BATCH_SIZE) {
      batches.push(gameIds.slice(i, i + IN_CLAUSE_BATCH_SIZE));
    }
    const results: Array<{ context_id: string; chat_type: string; cnt: bigint }> = [];
    for (const batch of batches) {
      const rows = await prisma.$queryRaw<Array<{ context_id: string; chat_type: string; cnt: bigint }>>(
        Prisma.sql`
        SELECT m."contextId" as context_id, m."chatType"::text as chat_type, COUNT(*)::bigint as cnt
        FROM "ChatMessage" m
        WHERE m."chatContextType" = 'GAME'
          AND m."deletedAt" IS NULL
          AND m."senderId" IS NOT NULL AND m."senderId" != ${userId}
          AND m."contextId" IN (${Prisma.join(batch)})
          AND ${sqlMessageNotReadByUser(userId)}
        GROUP BY m."contextId", m."chatType"
        `
      );
      results.push(...rows);
    }
    return results;
  }

  static async getGameUnreadCount(
    gameId: string,
    userId: string,
    chatTypeFilter: ChatType[]
  ): Promise<number> {
    const row = await prisma.$queryRaw<[{ n: bigint }]>(
      Prisma.sql`
        SELECT COUNT(*)::bigint AS n
        FROM "ChatMessage" m
        WHERE m."chatContextType" = 'GAME'::"ChatContextType"
          AND m."contextId" = ${gameId}
          AND m."chatType"::text IN (${Prisma.join(chatTypeFilter)})
          AND m."deletedAt" IS NULL
          AND m."senderId" IS NOT NULL
          AND m."senderId" <> ${userId}
          AND ${sqlMessageNotReadByUser(userId)}
      `
    );
    return Number(row[0]?.n ?? 0);
  }

  static buildGameChatTypeFilter(
    participant: { status: string; role: string } | undefined,
    gameStatus: string,
    isParentGameAdminOrOwner = false
  ): ChatType[] {
    const filter: ChatType[] = ['PUBLIC'];
    if (participant?.status === 'PLAYING') filter.push('PRIVATE');
    if ((participant?.role === 'OWNER' || participant?.role === 'ADMIN') || isParentGameAdminOrOwner) filter.push('ADMINS');
    if (gameStatus !== 'ANNOUNCED') filter.push('PHOTOS');
    return filter;
  }
}
