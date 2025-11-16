import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { MessageService } from './message.service';

export class ReadReceiptService {
  static async markMessageAsRead(messageId: string, userId: string) {
    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId }
    });

    if (!message) {
      throw new ApiError(404, 'Message not found');
    }

    // Validate access based on context type
    if (message.chatContextType === 'GAME') {
      await MessageService.validateGameAccess(message.contextId, userId);
    } else if (message.chatContextType === 'BUG') {
      await MessageService.validateBugAccess(message.contextId, userId);
    } else if (message.chatContextType === 'USER') {
      await MessageService.validateUserChatAccess(message.contextId, userId);
    }

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
        OR: [
          {
            participants: {
              some: { userId }
            }
          },
          {
            invites: {
              some: {
                receiverId: userId,
                status: 'PENDING'
              }
            }
          }
        ]
      },
      include: {
        participants: {
          where: { userId }
        }
      }
    });
    
    for (const game of userGames) {
      const participant = game.participants[0];
      
      // Build chat type filter based on user access
      const chatTypeFilter: any[] = ['PUBLIC'];
      
      // Add PRIVATE if user is a playing participant
      if (participant && participant.isPlaying) {
        chatTypeFilter.push('PRIVATE');
      }
      
      // Add ADMINS if user is owner or admin
      if (participant && (participant.role === 'OWNER' || participant.role === 'ADMIN')) {
        chatTypeFilter.push('ADMINS');
      }

      // Add PHOTOS if game status != ANNOUNCED (available for everyone like PUBLIC)
      if (game.status !== 'ANNOUNCED') {
        chatTypeFilter.push('PHOTOS');
      }

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

    // Build chat type filter based on user access
    const chatTypeFilter: any[] = ['PUBLIC'];

    // Add PRIVATE if user is a playing participant
    if (participant && participant.isPlaying) {
      chatTypeFilter.push('PRIVATE');
    }

    // Add ADMINS if user is owner or admin
    if (participant && (participant.role === 'OWNER' || participant.role === 'ADMIN')) {
      chatTypeFilter.push('ADMINS');
    }

    // Add PHOTOS if game status != ANNOUNCED (available for everyone like PUBLIC)
    if (game.status !== 'ANNOUNCED') {
      chatTypeFilter.push('PHOTOS');
    }

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
        id: {
          in: gameIds
        }
      },
      include: {
        participants: {
          where: { userId }
        },
        invites: {
          where: {
            receiverId: userId,
            status: 'PENDING'
          }
        }
      }
    });

    const unreadCounts: Record<string, number> = {};

    // Calculate unread count for each game based on user's access level
    for (const game of games) {
      const participant = game.participants[0];

      // Build chat type filter based on user access
      const chatTypeFilter: any[] = ['PUBLIC'];

      // Add PRIVATE if user is a playing participant
      if (participant && participant.isPlaying) {
        chatTypeFilter.push('PRIVATE');
      }

      // Add ADMINS if user is owner or admin
      if (participant && (participant.role === 'OWNER' || participant.role === 'ADMIN')) {
        chatTypeFilter.push('ADMINS');
      }

      // Add PHOTOS if game status != ANNOUNCED (available for everyone like PUBLIC)
      if (game.status !== 'ANNOUNCED') {
        chatTypeFilter.push('PHOTOS');
      }

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
      } catch (error) {
        unreadCounts[chatId] = 0;
      }
    }

    return unreadCounts;
  }

  static async markAllMessagesAsRead(gameId: string, userId: string, chatTypes: string[] = []) {
    const { participant } = await MessageService.validateGameAccess(gameId, userId);

    // Build chat type filter based on user access
    const chatTypeFilter: any[] = chatTypes.length > 0 ? chatTypes : ['PUBLIC'];

    // Add PRIVATE if user is a playing participant
    if (participant && participant.isPlaying && !chatTypes.length) {
      chatTypeFilter.push('PRIVATE');
    }

    // Add ADMINS if user is owner or admin
    if (participant && (participant.role === 'OWNER' || participant.role === 'ADMIN') && !chatTypes.length) {
      chatTypeFilter.push('ADMINS');
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
      } catch (error) {
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
}
