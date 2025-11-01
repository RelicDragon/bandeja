import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { MessageService } from './message.service';

export class ReadReceiptService {
  static async markMessageAsRead(messageId: string, userId: string) {
    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId },
      include: {
        game: {
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
        }
      }
    });

    if (!message) {
      throw new ApiError(404, 'Message not found');
    }

    await MessageService.validateGameAccess(message.gameId, userId);

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

    if (userGames.length === 0) {
      return { count: 0 };
    }

    // Calculate unread count for each game based on user's access level
    let totalUnreadCount = 0;
    
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

      const gameUnreadCount = await prisma.chatMessage.count({
        where: {
          gameId: game.id,
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

    return { count: totalUnreadCount };
  }

  static async getGameUnreadCount(gameId: string, userId: string) {
    const { participant } = await MessageService.validateGameAccess(gameId, userId);

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

    const unreadCount = await prisma.chatMessage.count({
      where: {
        gameId,
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

      const gameUnreadCount = await prisma.chatMessage.count({
        where: {
          gameId: game.id,
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
        gameId,
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
}
