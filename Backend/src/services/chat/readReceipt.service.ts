import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { MessageService } from './message.service';
import { hasParentGamePermissionWithUserCheck } from '../../utils/parentGamePermissions';
import { ChatContextType, ChatSyncEventType, ChatType, ParticipantRole, Prisma } from '@prisma/client';
import { UnreadCountBatchService } from './unreadCountBatch.service';
import { ChatSyncEventService } from './chatSyncEvent.service';
import { ChatReadCursorService } from './chatReadCursor.service';
import { sqlMessageNotReadByUser, sqlMessageNotReadByViewerColumn } from './chatReadUnreadSql';

const READ_SYNC_CHUNK = 400;

export class ReadReceiptService {
  static async markMessageAsRead(messageId: string, userId: string) {
    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId }
    });

    if (!message) {
      throw new ApiError(404, 'Message not found');
    }

    if (message.deletedAt) {
      throw new ApiError(404, 'Message not found');
    }

    await MessageService.validateMessageAccess(message, userId);

    const readAt = new Date();

    const syncSeq = await prisma.$transaction(async (tx) => {
      await tx.messageReadReceipt.upsert({
        where: {
          messageId_userId: {
            messageId,
            userId
          }
        },
        update: {
          readAt
        },
        create: {
          messageId,
          userId,
          readAt
        }
      });

      await ChatReadCursorService.mergeFromMessage(tx, userId, {
        id: message.id,
        chatContextType: message.chatContextType,
        contextId: message.contextId,
        chatType: message.chatType,
        serverSyncSeq: message.serverSyncSeq,
        createdAt: message.createdAt,
      });

      return ChatSyncEventService.appendEventInTransaction(
        tx,
        message.chatContextType,
        message.contextId,
        ChatSyncEventType.MESSAGES_READ_BATCH,
        {
          userId,
          readAt: readAt.toISOString(),
          messageIds: [messageId],
        }
      );
    });

    return {
      messageId,
      userId,
      readAt,
      syncSeq,
    };
  }

  static async getUnreadCount(userId: string) {
    const [participantRows, userChats, user] = await Promise.all([
      prisma.gameParticipant.findMany({
        where: { userId },
        select: {
          status: true,
          role: true,
          game: { select: { id: true, status: true } },
        },
      }),
      prisma.userChat.findMany({
        where: {
          OR: [{ user1Id: userId }, { user2Id: userId }],
        },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { isAdmin: true },
      }),
    ]);

    const userGames = participantRows.map((p) => ({
      id: p.game.id,
      status: String(p.game.status),
      participants: [{ status: String(p.status), role: String(p.role) }],
    }));

    const gameUnreadMap = await ReadReceiptService.getGamesUnreadCountsFromGames(userGames, userId);
    let totalUnreadCount = Object.values(gameUnreadMap).reduce((s, n) => s + n, 0);

    const userChatUnreadMap = await ReadReceiptService.getUserChatsUnreadCounts(
      userChats.map((c) => c.id),
      userId
    );
    totalUnreadCount += Object.values(userChatUnreadMap).reduce((s, n) => s + n, 0);

    if (user?.isAdmin) {
      const bugAdminRow = await prisma.$queryRaw<[{ n: bigint }]>(
        Prisma.sql`
          SELECT COUNT(*)::bigint AS n
          FROM "ChatMessage" m
          WHERE m."chatContextType" = 'BUG'::"ChatContextType"
            AND m."deletedAt" IS NULL
            AND m."senderId" IS NOT NULL
            AND m."senderId" <> ${userId}
            AND ${sqlMessageNotReadByUser(userId)}
        `
      );
      totalUnreadCount += Number(bugAdminRow[0]?.n ?? 0);
    } else {
      const [userBugs, userBugParticipants] = await Promise.all([
        prisma.bug.findMany({
          where: { senderId: userId },
          select: { id: true },
        }),
        prisma.bugParticipant.findMany({
          where: { userId },
          select: { bugId: true },
        }),
      ]);
      const allBugIds = Array.from(
        new Set([...userBugs.map((b) => b.id), ...userBugParticipants.map((p) => p.bugId)])
      );
      if (allBugIds.length > 0) {
        const bugUnreadMap = await UnreadCountBatchService.getUnreadCountsByContext('BUG', allBugIds, userId);
        totalUnreadCount += Object.values(bugUnreadMap).reduce((s, n) => s + n, 0);
      }
    }

    return { count: totalUnreadCount };
  }

  static async getGameUnreadCount(gameId: string, userId: string) {
    const { participant, game } = await MessageService.validateGameAccess(gameId, userId);

    const isParentGameAdminOrOwner = await hasParentGamePermissionWithUserCheck(
      gameId,
      userId,
      [ParticipantRole.OWNER, ParticipantRole.ADMIN]
    );

    const chatTypeFilter = UnreadCountBatchService.buildGameChatTypeFilter(participant, game.status, isParentGameAdminOrOwner);

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

    return { count: Number(row[0]?.n ?? 0) };
  }

  static async getGamesUnreadCounts(gameIds: string[], userId: string) {
    if (gameIds.length === 0) return {};
    const games = await prisma.game.findMany({
      where: { id: { in: gameIds } },
      include: { participants: { where: { userId } } },
    });
    return ReadReceiptService.getGamesUnreadCountsFromGames(
      games.map((g) => ({
        id: g.id,
        status: String(g.status),
        participants: g.participants.map((p) => ({
          status: String(p.status),
          role: String(p.role),
        })),
      })),
      userId
    );
  }

  static async getGamesUnreadCountsFromGames(
    games: Array<{ id: string; status: string; participants: Array<{ status: string; role: string }> }>,
    userId: string
  ): Promise<Record<string, number>> {
    if (games.length === 0) return {};
    const gameIds = games.map((g) => g.id);
    const rows = await UnreadCountBatchService.getGameUnreadCountsByContextAndType(gameIds, userId);
    const countByContextAndType: Record<string, Record<string, number>> = {};
    for (const row of rows) {
      const contextId = row.context_id;
      const chatType = row.chat_type;
      const cnt = Number(row.cnt);
      if (!contextId) continue;
      if (!countByContextAndType[contextId]) countByContextAndType[contextId] = {};
      countByContextAndType[contextId][chatType] = cnt;
    }
    const unreadCounts: Record<string, number> = {};
    for (const game of games) {
      const participant = game.participants[0];
      const chatTypeFilter = UnreadCountBatchService.buildGameChatTypeFilter(participant, game.status);
      let total = 0;
      for (const chatType of chatTypeFilter) {
        total += countByContextAndType[game.id]?.[chatType] ?? 0;
      }
      unreadCounts[game.id] = total;
    }
    return unreadCounts;
  }

  static async getUserChatUnreadCount(chatId: string, userId: string) {
    await MessageService.validateUserChatAccess(chatId, userId);

    const row = await prisma.$queryRaw<[{ n: bigint }]>(
      Prisma.sql`
        SELECT COUNT(*)::bigint AS n
        FROM "ChatMessage" m
        WHERE m."chatContextType" = 'USER'::"ChatContextType"
          AND m."contextId" = ${chatId}
          AND m."deletedAt" IS NULL
          AND m."senderId" IS NOT NULL
          AND m."senderId" <> ${userId}
          AND ${sqlMessageNotReadByUser(userId)}
      `
    );

    return { count: Number(row[0]?.n ?? 0) };
  }

  static async getUserChatsUnreadCounts(chatIds: string[], userId: string) {
    if (chatIds.length === 0) {
      return {};
    }

    const validChats = await prisma.userChat.findMany({
      where: {
        id: { in: chatIds },
        OR: [{ user1Id: userId }, { user2Id: userId }]
      },
      select: { id: true }
    });
    const validChatIds = new Set(validChats.map((c) => c.id));

    const unreadCounts: Record<string, number> = Object.fromEntries(chatIds.map((id) => [id, 0]));

    if (validChatIds.size === 0) {
      return unreadCounts;
    }

    const idList = Array.from(validChatIds);
    const counts = await prisma.$queryRaw<Array<{ contextId: string; n: bigint }>>(
      Prisma.sql`
        SELECT m."contextId", COUNT(*)::bigint AS n
        FROM "ChatMessage" m
        WHERE m."chatContextType" = 'USER'::"ChatContextType"
          AND m."contextId" IN (${Prisma.join(idList)})
          AND m."deletedAt" IS NULL
          AND m."senderId" IS NOT NULL
          AND m."senderId" <> ${userId}
          AND ${sqlMessageNotReadByUser(userId)}
        GROUP BY m."contextId"
      `
    );

    for (const row of counts) {
      unreadCounts[row.contextId] = Number(row.n);
    }

    return unreadCounts;
  }

  static async getGroupChannelsUnreadCounts(groupIds: string[], userId: string) {
    if (groupIds.length === 0) return {};
    const participantGroups = await prisma.groupChannelParticipant.findMany({
      where: {
        groupChannelId: { in: groupIds },
        userId,
        hidden: false,
      },
      select: { groupChannelId: true },
    });
    const participantGroupIds = participantGroups.map((p) => p.groupChannelId);
    if (participantGroupIds.length === 0) return {};
    return UnreadCountBatchService.getUnreadCountsByContext('GROUP', participantGroupIds, userId);
  }

  static async markAllMessagesAsRead(gameId: string, userId: string, chatTypes: string[] = []) {
    const { participant, game } = await MessageService.validateGameAccess(gameId, userId);

    const isParentGameAdminOrOwner = await hasParentGamePermissionWithUserCheck(
      gameId,
      userId,
      [ParticipantRole.OWNER, ParticipantRole.ADMIN]
    );

    let chatTypeFilter: any[];

    if (chatTypes.length > 0) {
      chatTypeFilter = [...chatTypes];
      if (!(participant && participant.status === 'PLAYING') && chatTypeFilter.includes('PRIVATE')) {
        chatTypeFilter = chatTypeFilter.filter((t: string) => t !== 'PRIVATE');
      }
      const canAccessAdmins = (participant && (participant.role === 'OWNER' || participant.role === 'ADMIN')) || isParentGameAdminOrOwner;
      if (!canAccessAdmins && chatTypeFilter.includes('ADMINS')) {
        chatTypeFilter = chatTypeFilter.filter((t: string) => t !== 'ADMINS');
      }
    } else {
      chatTypeFilter = UnreadCountBatchService.buildGameChatTypeFilter(participant, game.status, isParentGameAdminOrOwner);
    }

    // Get all unread messages for this game and chat types
    const unreadMessages = await prisma.chatMessage.findMany({
      where: {
        chatContextType: 'GAME',
        contextId: gameId,
        chatType: {
          in: chatTypeFilter
        },
        deletedAt: null,
        senderId: {
          not: userId
        },
        readReceipts: {
          none: {
            userId
          }
        }
      },
      select: {
        id: true,
        chatContextType: true,
        contextId: true,
        chatType: true,
        serverSyncSeq: true,
        createdAt: true,
      }
    });

    if (unreadMessages.length === 0) {
      return { count: 0, syncSeq: undefined as number | undefined };
    }

    const readAt = new Date();
    const readAtIso = readAt.toISOString();
    const readReceipts = unreadMessages.map((message) => ({
      messageId: message.id,
      userId,
      readAt,
    }));
    return prisma.$transaction(async (tx) => {
      await tx.messageReadReceipt.createMany({
        data: readReceipts,
        skipDuplicates: true,
      });
      await ChatReadCursorService.mergeFromMessages(tx, userId, unreadMessages);
      const ids = unreadMessages.map((m) => m.id);
      let syncSeq: number | undefined;
      for (let i = 0; i < ids.length; i += READ_SYNC_CHUNK) {
        syncSeq = await ChatSyncEventService.appendEventInTransaction(
          tx,
          'GAME',
          gameId,
          ChatSyncEventType.MESSAGES_READ_BATCH,
          { userId, readAt: readAtIso, messageIds: ids.slice(i, i + READ_SYNC_CHUNK) }
        );
      }
      return { count: unreadMessages.length, syncSeq };
    });
  }

  static async markUserChatAsRead(chatId: string, userId: string) {
    await MessageService.validateUserChatAccess(chatId, userId);

    const unreadMessages = await prisma.chatMessage.findMany({
      where: {
        chatContextType: 'USER',
        contextId: chatId,
        deletedAt: null,
        senderId: { not: userId },
        readReceipts: {
          none: { userId }
        }
      },
      select: {
        id: true,
        chatContextType: true,
        contextId: true,
        chatType: true,
        serverSyncSeq: true,
        createdAt: true,
      }
    });

    if (unreadMessages.length === 0) {
      return { count: 0, syncSeq: undefined as number | undefined };
    }

    const readAt = new Date();
    const readAtIso = readAt.toISOString();
    const readReceipts = unreadMessages.map((message) => ({
      messageId: message.id,
      userId,
      readAt,
    }));
    return prisma.$transaction(async (tx) => {
      await tx.messageReadReceipt.createMany({
        data: readReceipts,
        skipDuplicates: true,
      });
      await ChatReadCursorService.mergeFromMessages(tx, userId, unreadMessages);
      const ids = unreadMessages.map((m) => m.id);
      let syncSeq: number | undefined;
      for (let i = 0; i < ids.length; i += READ_SYNC_CHUNK) {
        syncSeq = await ChatSyncEventService.appendEventInTransaction(
          tx,
          'USER',
          chatId,
          ChatSyncEventType.MESSAGES_READ_BATCH,
          { userId, readAt: readAtIso, messageIds: ids.slice(i, i + READ_SYNC_CHUNK) }
        );
      }
      return { count: unreadMessages.length, syncSeq };
    });
  }

  /**
   * Unified method to get unread count for any chat context type
   */
  static async getUnreadCountForContext(
    contextType: ChatContextType,
    contextId: string,
    userId: string
  ): Promise<number> {
    if (contextType === 'GAME') {
      const result = await this.getGameUnreadCount(contextId, userId);
      return result.count;
    } else if (contextType === 'USER') {
      const result = await this.getUserChatUnreadCount(contextId, userId);
      return result.count;
    } else if (contextType === 'GROUP') {
      const rows = await prisma.$queryRaw<Array<{ n: bigint }>>(
        Prisma.sql`
          SELECT COUNT(*)::bigint AS n
          FROM "ChatMessage" m
          WHERE m."chatContextType" = 'GROUP'::"ChatContextType"
            AND m."contextId" = ${contextId}
            AND m."deletedAt" IS NULL
            AND m."senderId" IS NOT NULL
            AND m."senderId" <> ${userId}
            AND ${sqlMessageNotReadByUser(userId)}
        `
      );
      return Number(rows[0]?.n ?? 0);
    }
    return 0;
  }

  /** One DB round-trip for USER/GROUP unread per viewer; GAME uses parallel per-user counts; BUG → zeros. */
  static async getUnreadCountsForContextForUsers(
    contextType: ChatContextType,
    contextId: string,
    userIds: string[]
  ): Promise<Map<string, number>> {
    const unique = [...new Set(userIds.filter((id) => typeof id === 'string' && id.length > 0))];
    const out = new Map<string, number>();
    if (unique.length === 0) return out;

    if (contextType === 'BUG') {
      unique.forEach((u) => out.set(u, 0));
      return out;
    }

    if (contextType === 'GAME') {
      await Promise.all(
        unique.map(async (userId) => {
          const n = await this.getUnreadCountForContext(contextType, contextId, userId);
          out.set(userId, n);
        })
      );
      return out;
    }

    if (contextType !== 'USER' && contextType !== 'GROUP') {
      unique.forEach((u) => out.set(u, 0));
      return out;
    }

    const typeCond =
      contextType === 'USER'
        ? Prisma.sql`m."chatContextType" = 'USER'::"ChatContextType"`
        : Prisma.sql`m."chatContextType" = 'GROUP'::"ChatContextType"`;

    const viewerCol = Prisma.raw('recipient."userId"');
    const valuesSql = Prisma.join(unique.map((uid) => Prisma.sql`(${uid})`));

    const rows = await prisma.$queryRaw<Array<{ userId: string; n: bigint }>>(
      Prisma.sql`
        SELECT recipient."userId"::text AS "userId", COALESCE(COUNT(m.id), 0)::bigint AS n
        FROM (VALUES ${valuesSql}) AS recipient("userId")
        LEFT JOIN "ChatMessage" m ON
          ${typeCond}
          AND m."contextId" = ${contextId}
          AND m."deletedAt" IS NULL
          AND m."senderId" IS NOT NULL
          AND m."senderId" <> recipient."userId"
          AND ${sqlMessageNotReadByViewerColumn(viewerCol)}
        GROUP BY recipient."userId"
      `
    );
    for (const uid of unique) {
      out.set(uid, 0);
    }
    for (const row of rows) {
      out.set(row.userId, Number(row.n ?? 0));
    }
    return out;
  }

  /**
   * Unified method to mark all messages as read for any chat context type
   */
  static async markAllMessagesAsReadForContext(
    contextType: ChatContextType,
    contextId: string,
    userId: string,
    chatTypes?: string[]
  ) {
    if (contextType === 'GAME') {
      return await this.markAllMessagesAsRead(contextId, userId, chatTypes || []);
    } else if (contextType === 'USER') {
      return await this.markUserChatAsRead(contextId, userId);
    } else if (contextType === 'GROUP') {
      await MessageService.validateGroupChannelAccess(contextId, userId);
      const readAt = new Date();
      const readAtIso = readAt.toISOString();

      return prisma.$transaction(
        async (tx) => {
          const inserted = await tx.$executeRaw(
            Prisma.sql`
              INSERT INTO "MessageReadReceipt" ("id", "messageId", "userId", "readAt")
              SELECT gen_random_uuid()::text, m.id, ${userId}, ${readAt}
              FROM "ChatMessage" m
              WHERE m."chatContextType" = 'GROUP'::"ChatContextType"
                AND m."contextId" = ${contextId}
                AND m."deletedAt" IS NULL
                AND m."senderId" IS NOT NULL
                AND m."senderId" <> ${userId}
                AND NOT EXISTS (
                  SELECT 1 FROM "MessageReadReceipt" r
                  WHERE r."messageId" = m.id AND r."userId" = ${userId}
                )
              ON CONFLICT ("messageId", "userId") DO NOTHING
            `
          );

          const total = Number(inserted);
          if (total === 0) {
            return { count: 0, syncSeq: undefined as number | undefined };
          }

          const winners = await tx.$queryRaw<
            Array<{
              id: string;
              chatContextType: string;
              contextId: string;
              chatType: string;
              serverSyncSeq: number | null;
              createdAt: Date;
            }>
          >(Prisma.sql`
            SELECT DISTINCT ON (m."chatType")
              m.id,
              m."chatContextType"::text AS "chatContextType",
              m."contextId",
              m."chatType"::text AS "chatType",
              m."serverSyncSeq",
              m."createdAt"
            FROM "ChatMessage" m
            WHERE m."chatContextType" = 'GROUP'::"ChatContextType"
              AND m."contextId" = ${contextId}
              AND m."deletedAt" IS NULL
              AND m."senderId" IS NOT NULL
              AND m."senderId" <> ${userId}
              AND EXISTS (
                SELECT 1 FROM "MessageReadReceipt" r
                WHERE r."messageId" = m.id AND r."userId" = ${userId}
              )
            ORDER BY
              m."chatType",
              COALESCE(m."serverSyncSeq", -1) DESC,
              m."createdAt" DESC,
              m.id DESC
          `);

          await ChatReadCursorService.mergeFromMessages(
            tx,
            userId,
            winners.map((w) => ({
              id: w.id,
              chatContextType: w.chatContextType as ChatContextType,
              contextId: w.contextId,
              chatType: w.chatType as ChatType,
              serverSyncSeq: w.serverSyncSeq,
              createdAt: w.createdAt,
            }))
          );

          let syncSeq: number | undefined;
          let lastId = '';
          while (true) {
            const chunk =
              lastId === ''
                ? await tx.$queryRaw<Array<{ id: string }>>(
                    Prisma.sql`
                      SELECT m.id
                      FROM "ChatMessage" m
                      INNER JOIN "MessageReadReceipt" r
                        ON r."messageId" = m.id
                        AND r."userId" = ${userId}
                        AND r."readAt" = ${readAt}
                      WHERE m."chatContextType" = 'GROUP'::"ChatContextType"
                        AND m."contextId" = ${contextId}
                        AND m."deletedAt" IS NULL
                        AND m."senderId" IS NOT NULL
                        AND m."senderId" <> ${userId}
                      ORDER BY m.id ASC
                      LIMIT ${READ_SYNC_CHUNK}
                    `
                  )
                : await tx.$queryRaw<Array<{ id: string }>>(
                    Prisma.sql`
                      SELECT m.id
                      FROM "ChatMessage" m
                      INNER JOIN "MessageReadReceipt" r
                        ON r."messageId" = m.id
                        AND r."userId" = ${userId}
                        AND r."readAt" = ${readAt}
                      WHERE m."chatContextType" = 'GROUP'::"ChatContextType"
                        AND m."contextId" = ${contextId}
                        AND m."deletedAt" IS NULL
                        AND m."senderId" IS NOT NULL
                        AND m."senderId" <> ${userId}
                        AND m.id > ${lastId}
                      ORDER BY m.id ASC
                      LIMIT ${READ_SYNC_CHUNK}
                    `
                  );

            if (chunk.length === 0) {
              break;
            }
            const messageIds = chunk.map((c) => c.id);
            lastId = messageIds[messageIds.length - 1]!;
            syncSeq = await ChatSyncEventService.appendEventInTransaction(
              tx,
              'GROUP',
              contextId,
              ChatSyncEventType.MESSAGES_READ_BATCH,
              { userId, readAt: readAtIso, messageIds }
            );
          }

          return { count: total, syncSeq };
        },
        { timeout: 120_000 }
      );
    }
    return { count: 0, syncSeq: undefined as number | undefined };
  }
}
