import { ChatType, Prisma } from '@prisma/client';
import { ParticipantRole } from '@prisma/client';
import prisma from '../../config/database';
import { hasParentGamePermissionWithUserCheck } from '../../utils/parentGamePermissions';
import { sqlMessageNotReadByUser } from './chatReadUnreadSql';

export type UnreadCountMap = Record<string, number>;

const IN_CLAUSE_BATCH_SIZE = 500;

function chatContextTypeSql(chatContextType: 'USER' | 'BUG' | 'GROUP'): Prisma.Sql {
  if (chatContextType === 'USER') return Prisma.sql`'USER'::"ChatContextType"`;
  if (chatContextType === 'BUG') return Prisma.sql`'BUG'::"ChatContextType"`;
  return Prisma.sql`'GROUP'::"ChatContextType"`;
}

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
        WHERE m."chatContextType" = ${chatContextTypeSql(chatContextType)}
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
    if (participant?.status === 'PLAYING' || participant?.status === 'NON_PLAYING') {
      filter.push('PRIVATE');
    }
    if ((participant?.role === 'OWNER' || participant?.role === 'ADMIN') || isParentGameAdminOrOwner) filter.push('ADMINS');
    return filter;
  }

  /** Same filter as snapshot/mark-read — includes league parent-game admin/owner. */
  static async resolveGameChatTypeFilterForUser(
    gameId: string,
    userId: string,
    participant: { status: string; role: string } | undefined,
    gameStatus: string
  ): Promise<ChatType[]> {
    const isParentGameAdminOrOwner = await hasParentGamePermissionWithUserCheck(
      gameId,
      userId,
      [ParticipantRole.OWNER, ParticipantRole.ADMIN]
    );
    return this.buildGameChatTypeFilter(participant, gameStatus, isParentGameAdminOrOwner);
  }

  /**
   * Batch resolve chat-type filters for many games.
   * Loads isAdmin once + one parentId query + one parent-participant query
   * instead of per-game hasParentGamePermissionWithUserCheck.
   */
  static async resolveGameChatTypeFiltersForUserBatch(
    games: Array<{
      id: string;
      status: string;
      participants: Array<{ userId?: string; status: string; role: string }>;
    }>,
    userId: string
  ): Promise<Map<string, ChatType[]>> {
    const result = new Map<string, ChatType[]>();
    if (games.length === 0) return result;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true },
    });
    const isAdmin = user?.isAdmin ?? false;

    const viewerParticipant = (
      game: (typeof games)[number],
    ): { status: string; role: string } | undefined => {
      const byUser = game.participants.find((p) => p.userId === userId);
      if (byUser) return byUser;
      // Callers that pre-filter `participants` to the viewer often omit userId.
      if (game.participants.length === 1) return game.participants[0];
      return undefined;
    };

    if (isAdmin) {
      for (const game of games) {
        result.set(
          game.id,
          this.buildGameChatTypeFilter(viewerParticipant(game), game.status, true),
        );
      }
      return result;
    }

    const needsParentCheck: string[] = [];
    for (const game of games) {
      const participant = viewerParticipant(game);
      const alreadyAdmin =
        participant?.role === 'OWNER' || participant?.role === 'ADMIN';
      if (!alreadyAdmin) {
        needsParentCheck.push(game.id);
      }
    }

    const parentAdminGameIds = new Set<string>();
    if (needsParentCheck.length > 0) {
      const parentRows = await prisma.game.findMany({
        where: { id: { in: needsParentCheck }, parentId: { not: null } },
        select: { id: true, parentId: true },
      });
      const parentIds = [
        ...new Set(
          parentRows
            .map((r) => r.parentId)
            .filter((id): id is string => typeof id === 'string' && id.length > 0),
        ),
      ];
      if (parentIds.length > 0) {
        const parentAdminRows = await prisma.gameParticipant.findMany({
          where: {
            gameId: { in: parentIds },
            userId,
            role: { in: [ParticipantRole.OWNER, ParticipantRole.ADMIN] },
            status: { in: ['PLAYING', 'NON_PLAYING', 'IN_QUEUE'] },
          },
          select: { gameId: true },
        });
        const adminParentIds = new Set(parentAdminRows.map((r) => r.gameId));
        for (const row of parentRows) {
          if (row.parentId && adminParentIds.has(row.parentId)) {
            parentAdminGameIds.add(row.id);
          }
        }
      }
    }

    for (const game of games) {
      const participant = viewerParticipant(game);
      result.set(
        game.id,
        this.buildGameChatTypeFilter(
          participant,
          game.status,
          parentAdminGameIds.has(game.id),
        ),
      );
    }
    return result;
  }
}
