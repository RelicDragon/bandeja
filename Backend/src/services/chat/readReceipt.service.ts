import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { MessageService } from './message.service';
import { hasParentGamePermissionWithUserCheck } from '../../utils/parentGamePermissions';
import { ChatContextType, ChatSyncEventType, ParticipantRole, Prisma } from '@prisma/client';
import { UnreadCountBatchService } from './unreadCountBatch.service';
import { ChatSyncEventService } from './chatSyncEvent.service';

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

      return ChatSyncEventService.appendEventInTransaction(
        tx,
        message.chatContextType,
        message.contextId,
        ChatSyncEventType.MESSAGE_READ_RECEIPT,
        {
          readReceipt: {
            messageId,
            userId,
            readAt: readAt.toISOString(),
          },
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
    let totalUnreadCount = 0;

    // 1. Count unread messages from GAME chats
    const userGames = await prisma.game.findMany({
      where: {
        participants: {
          some: { userId },
        },
      },
      include: {
        participants: {
          where: { userId },
        },
      },
    });
    
    for (const game of userGames) {
      const participant = game.participants[0];
      const chatTypeFilter = UnreadCountBatchService.buildGameChatTypeFilter(participant, game.status);

      const gameUnreadCount = await prisma.chatMessage.count({
        where: {
          chatContextType: 'GAME',
          contextId: game.id,
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
        }
      });

      totalUnreadCount += gameUnreadCount;
    }

    // 2. Count unread messages from USER chats
    const userChats = await prisma.userChat.findMany({
      where: {
        OR: [
          { user1Id: userId },
          { user2Id: userId }
        ]
      }
    });

    for (const chat of userChats) {
      const userChatUnreadCount = await prisma.chatMessage.count({
        where: {
          chatContextType: 'USER',
          contextId: chat.id,
          deletedAt: null,
          senderId: { not: userId },
          readReceipts: {
            none: { userId }
          }
        }
      });

      totalUnreadCount += userChatUnreadCount;
    }

    // 3. Count unread messages from BUG chats
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true }
    });

    if (user && user.isAdmin) {
      // Admin can see all bug chats
      const bugUnreadCount = await prisma.chatMessage.count({
        where: {
          chatContextType: 'BUG',
          deletedAt: null,
          senderId: { not: userId },
          readReceipts: {
            none: { userId }
          }
        }
      });

      totalUnreadCount += bugUnreadCount;
    } else {
      // Regular users can see bugs they created or bugs they joined as participants
      const userBugs = await prisma.bug.findMany({
        where: { senderId: userId },
        select: { id: true }
      });

      const userBugParticipants = await prisma.bugParticipant.findMany({
        where: { userId },
        select: { bugId: true }
      });

      const allBugIds = new Set([
        ...userBugs.map(bug => bug.id),
        ...userBugParticipants.map(p => p.bugId)
      ]);

      for (const bugId of allBugIds) {
        const bugUnreadCount = await prisma.chatMessage.count({
          where: {
            chatContextType: 'BUG',
            contextId: bugId,
            deletedAt: null,
            senderId: { not: userId },
            readReceipts: {
              none: { userId }
            }
          }
        });

        totalUnreadCount += bugUnreadCount;
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

    const unreadCount = await prisma.chatMessage.count({
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
      }
    });

    return { count: unreadCount };
  }

  static async getGamesUnreadCounts(gameIds: string[], userId: string) {
    if (gameIds.length === 0) return {};
    const games = await prisma.game.findMany({
      where: { id: { in: gameIds } },
      include: { participants: { where: { userId } } },
    });
    const unreadCounts: Record<string, number> = {};
    for (const game of games) {
      const participant = game.participants[0];
      const chatTypeFilter = UnreadCountBatchService.buildGameChatTypeFilter(participant, game.status);
      const gameUnreadCount = await prisma.chatMessage.count({
        where: {
          chatContextType: 'GAME',
          contextId: game.id,
          chatType: { in: chatTypeFilter },
          deletedAt: null,
          senderId: { not: userId },
          readReceipts: { none: { userId } },
        },
      });
      unreadCounts[game.id] = gameUnreadCount;
    }
    return unreadCounts;
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

    const unreadCount = await prisma.chatMessage.count({
      where: {
        chatContextType: 'USER',
        contextId: chatId,
        deletedAt: null,
        senderId: { not: userId },
        readReceipts: {
          none: { userId }
        }
      }
    });

    return { count: unreadCount };
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

    const counts = await prisma.chatMessage.groupBy({
      by: ['contextId'],
      where: {
        chatContextType: ChatContextType.USER,
        contextId: { in: Array.from(validChatIds) },
        deletedAt: null,
        senderId: { not: userId },
        readReceipts: { none: { userId } }
      },
      _count: { id: true }
    });

    for (const row of counts) {
      unreadCounts[row.contextId] = row._count.id;
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
        id: true
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
        id: true
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
            AND NOT EXISTS (
              SELECT 1 FROM "MessageReadReceipt" r
              WHERE r."messageId" = m.id AND r."userId" = ${userId}
            )
        `
      );
      return Number(rows[0]?.n ?? 0);
    }
    return 0;
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
      const messages = await prisma.chatMessage.findMany({
        where: {
          chatContextType: 'GROUP',
          contextId,
          deletedAt: null,
          senderId: { not: userId },
        },
      });

      if (messages.length === 0) {
        return { count: 0, syncSeq: undefined as number | undefined };
      }

      const readAt = new Date();
      const readAtIso = readAt.toISOString();

      return prisma.$transaction(async (tx) => {
        for (const message of messages) {
          await tx.messageReadReceipt.upsert({
            where: {
              messageId_userId: {
                messageId: message.id,
                userId,
              },
            },
            update: { readAt },
            create: {
              messageId: message.id,
              userId,
              readAt,
            },
          });
        }
        const ids = messages.map((m) => m.id);
        let syncSeq: number | undefined;
        for (let i = 0; i < ids.length; i += READ_SYNC_CHUNK) {
          syncSeq = await ChatSyncEventService.appendEventInTransaction(
            tx,
            'GROUP',
            contextId,
            ChatSyncEventType.MESSAGES_READ_BATCH,
            { userId, readAt: readAtIso, messageIds: ids.slice(i, i + READ_SYNC_CHUNK) }
          );
        }
        return { count: messages.length, syncSeq };
      });
    }
    return { count: 0, syncSeq: undefined as number | undefined };
  }
}
