import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { MessageService } from './message.service';
import { hasParentGamePermissionWithUserCheck } from '../../utils/parentGamePermissions';
import { ParticipantRole, ChatContextType } from '@prisma/client';
import { UnreadCountBatchService } from './unreadCountBatch.service';

export class ReadReceiptService {
  static async markMessageAsRead(messageId: string, userId: string) {
    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId }
    });

    if (!message) {
      throw new ApiError(404, 'Message not found');
    }

    await MessageService.validateMessageAccess(message, userId);

    await prisma.messageReadReceipt.upsert({
      where: {
        messageId_userId: {
          messageId,
          userId
        }
      },
      update: {
        readAt: new Date()
      },
      create: {
        messageId,
        userId,
        readAt: new Date()
      }
    });

    return { 
      messageId, 
      userId, 
      readAt: new Date() 
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
    if (gameIds.length === 0) {
      return {};
    }

    // Get all games with participants in one query
    const games = await prisma.game.findMany({
      where: {
        id: { in: gameIds },
      },
      include: {
        participants: {
          where: { userId },
        },
      },
    });

    const unreadCounts: Record<string, number> = {};

    for (const game of games) {
      const participant = game.participants[0];
      const chatTypeFilter = UnreadCountBatchService.buildGameChatTypeFilter(participant, game.status);

      const gameUnreadCount = await prisma.chatMessage.count({
        where: {
          chatContextType: 'GAME',
          contextId: game.id,
          chatType: {
            in: chatTypeFilter
          },
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

      unreadCounts[game.id] = gameUnreadCount;
    }

    return unreadCounts;
  }

  static async getUserChatUnreadCount(chatId: string, userId: string) {
    await MessageService.validateUserChatAccess(chatId, userId);

    const unreadCount = await prisma.chatMessage.count({
      where: {
        chatContextType: 'USER',
        contextId: chatId,
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

    const unreadCounts: Record<string, number> = {};

    for (const chatId of chatIds) {
      try {
        await MessageService.validateUserChatAccess(chatId, userId);
        
        const unreadCount = await prisma.chatMessage.count({
          where: {
            chatContextType: 'USER',
            contextId: chatId,
            senderId: { not: userId },
            readReceipts: {
              none: { userId }
            }
          }
        });

        unreadCounts[chatId] = unreadCount;
      } catch {
        unreadCounts[chatId] = 0;
      }
    }

    return unreadCounts;
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
      return { count: 0 };
    }

    // Mark all messages as read
    const readAt = new Date();
    const readReceipts = unreadMessages.map(message => ({
      messageId: message.id,
      userId,
      readAt
    }));

    await prisma.messageReadReceipt.createMany({
      data: readReceipts,
      skipDuplicates: true
    });

    return { count: unreadMessages.length };
  }

  static async markUserChatAsRead(chatId: string, userId: string) {
    await MessageService.validateUserChatAccess(chatId, userId);

    const unreadMessages = await prisma.chatMessage.findMany({
      where: {
        chatContextType: 'USER',
        contextId: chatId,
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
      return { count: 0 };
    }

    const readAt = new Date();
    const readReceipts = unreadMessages.map(message => ({
      messageId: message.id,
      userId,
      readAt
    }));

    await prisma.messageReadReceipt.createMany({
      data: readReceipts,
      skipDuplicates: true
    });

    return { count: unreadMessages.length };
  }

  static async getBugUnreadCount(bugId: string, userId: string) {
    const { isSender, isAdmin, isParticipant } = await MessageService.validateBugAccess(bugId, userId, false);

    if (!isSender && !isAdmin && !isParticipant) {
      return { count: 0 };
    }

    const unreadCount = await prisma.chatMessage.count({
      where: {
        chatContextType: 'BUG',
        contextId: bugId,
        senderId: { not: userId },
        readReceipts: {
          none: {
            userId
          }
        }
      }
    });

    return { count: unreadCount };
  }

  static async getBugsUnreadCounts(bugIds: string[], userId: string) {
    if (bugIds.length === 0) {
      return {};
    }

    const unreadCounts: Record<string, number> = {};

    for (const bugId of bugIds) {
      try {
        const { isSender, isAdmin, isParticipant } = await MessageService.validateBugAccess(bugId, userId, false);
        
        if (!isSender && !isAdmin && !isParticipant) {
          unreadCounts[bugId] = 0;
          continue;
        }
        
        const unreadCount = await prisma.chatMessage.count({
          where: {
            chatContextType: 'BUG',
            contextId: bugId,
            senderId: { not: userId },
            readReceipts: {
              none: {
                userId
              }
            }
          }
        });

        unreadCounts[bugId] = unreadCount;
      } catch {
        unreadCounts[bugId] = 0;
      }
    }

    return unreadCounts;
  }

  static async markAllBugMessagesAsRead(bugId: string, userId: string) {
    await MessageService.validateBugAccess(bugId, userId);

    const unreadMessages = await prisma.chatMessage.findMany({
      where: {
        chatContextType: 'BUG',
        contextId: bugId,
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
      return { count: 0 };
    }

    const readAt = new Date();
    const readReceipts = unreadMessages.map(message => ({
      messageId: message.id,
      userId,
      readAt
    }));

    await prisma.messageReadReceipt.createMany({
      data: readReceipts,
      skipDuplicates: true
    });

    return { count: unreadMessages.length };
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
      const messages = await prisma.chatMessage.findMany({
        where: {
          chatContextType: 'GROUP',
          contextId,
          senderId: { not: userId }
        },
        include: {
          readReceipts: {
            where: { userId }
          }
        }
      });
      return messages.filter(msg => msg.readReceipts.length === 0).length;
    } else if (contextType === 'BUG') {
      const result = await this.getBugUnreadCount(contextId, userId);
      return result.count;
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
    } else if (contextType === 'BUG') {
      return await this.markAllBugMessagesAsRead(contextId, userId);
    } else if (contextType === 'GROUP') {
      await MessageService.validateGroupChannelAccess(contextId, userId);
      const messages = await prisma.chatMessage.findMany({
        where: {
          chatContextType: 'GROUP',
          contextId,
          senderId: { not: userId }
        }
      });

      const readReceipts = await Promise.all(
        messages.map(message =>
          prisma.messageReadReceipt.upsert({
            where: {
              messageId_userId: {
                messageId: message.id,
                userId
              }
            },
            update: {
              readAt: new Date()
            },
            create: {
              messageId: message.id,
              userId,
              readAt: new Date()
            }
          })
        )
      );

      return { count: readReceipts.length };
    }
    return { count: 0 };
  }
}
