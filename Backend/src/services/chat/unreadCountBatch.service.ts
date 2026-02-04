import { ChatType, Prisma } from '@prisma/client';
import prisma from '../../config/database';

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
          AND m."senderId" IS NOT NULL AND m."senderId" != ${userId}
          AND m."contextId" IN (${Prisma.join(batch)})
          AND NOT EXISTS (
            SELECT 1 FROM "MessageReadReceipt" r
            WHERE r."messageId" = m.id AND r."userId" = ${userId}
          )
        GROUP BY m."contextId"
      `
      );
      for (const row of result) {
        map[row.contextId] = Number(row.cnt);
      }
    }
    return map;
  }

  static async getGameUnreadCount(
    gameId: string,
    userId: string,
    chatTypeFilter: ChatType[]
  ): Promise<number> {
    const result = await prisma.chatMessage.count({
      where: {
        chatContextType: 'GAME',
        contextId: gameId,
        chatType: { in: chatTypeFilter },
        senderId: { not: userId },
        readReceipts: { none: { userId } },
      },
    });
    return result;
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
