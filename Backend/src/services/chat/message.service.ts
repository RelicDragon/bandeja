import prisma from '../../config/database';
import { MessageState, ChatType, ChatContextType } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';
import { USER_SELECT_FIELDS } from '../../utils/constants';
import telegramNotificationService from '../telegram/notification.service';
import { GameReadService } from '../game/read.service';
import { UserChatService } from './userChat.service';

export class MessageService {
  static async validateGameAccess(gameId: string, userId: string) {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
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

    if (!game) {
      throw new ApiError(404, 'Game not found');
    }

    const isParticipant = game.participants.length > 0;
    const hasPendingInvite = game.invites.length > 0;
    const isPublicGame = game.isPublic;
    const participant = game.participants[0];

    if (!isParticipant && !hasPendingInvite && !isPublicGame) {
      throw new ApiError(403, 'You are not a participant or invited in this game');
    }

    return { game, isParticipant, hasPendingInvite, isPublicGame, participant };
  }

  static async validateBugAccess(bugId: string, userId: string) {
    const bug = await prisma.bug.findUnique({
      where: { id: bugId },
      include: {
        sender: true
      }
    });

    if (!bug) {
      throw new ApiError(404, 'Bug not found');
    }

    // Check if user is the bug sender or an admin
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true, isTrainer: true }
    });

    if (!user) {
      throw new ApiError(401, 'User not found');
    }

    const isSender = bug.senderId === userId;
    const isAdmin = user.isAdmin || user.isTrainer;

    if (!isSender && !isAdmin) {
      throw new ApiError(403, 'You can only access your own bugs or must be an admin');
    }

    return { bug, isSender, isAdmin };
  }

  static async validateUserChatAccess(userChatId: string, userId: string) {
    const userChat = await prisma.userChat.findUnique({
      where: { id: userChatId },
      include: { user1: true, user2: true }
    });

    if (!userChat) {
      throw new ApiError(404, 'Chat not found');
    }

    if (userChat.user1Id !== userId && userChat.user2Id !== userId) {
      throw new ApiError(403, 'You are not a participant in this chat');
    }

    return { userChat };
  }

  static async validateChatTypeAccess(participant: any, chatType: ChatType, game: any) {
    if (chatType === ChatType.PRIVATE && (!participant || !participant.isPlaying)) {
      throw new ApiError(403, 'Only playing participants can access private chat');
    }

    if (chatType === ChatType.ADMINS && (!participant || (participant.role !== 'OWNER' && participant.role !== 'ADMIN'))) {
      throw new ApiError(403, 'Only game owners and admins can access admin chat');
    }

    if (chatType === ChatType.PHOTOS && game.status === 'ANNOUNCED') {
      throw new ApiError(403, 'Photos chat is only available when game has started');
    }
  }

  static generateThumbnailUrls(mediaUrls: string[]): string[] {
    return mediaUrls.map(originalUrl => {
      if (!originalUrl) return originalUrl;
      
      if (originalUrl.includes('/uploads/chat/originals/')) {
        const filename = originalUrl.split('/').pop() || '';
        const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
        const thumbnailFilename = `${nameWithoutExt}_thumb.jpg`;
        
        const thumbnailUrl = originalUrl
          .replace('/uploads/chat/originals/', '/uploads/chat/thumbnails/')
          .replace(filename, thumbnailFilename);
        
        return thumbnailUrl;
      }
      
      return originalUrl;
    });
  }

  static getMessageInclude() {
    return {
      sender: {
          select: USER_SELECT_FIELDS
      },
      replyTo: {
        select: {
          id: true,
          content: true,
          sender: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true,
              level: true,
              gender: true
            }
          }
        }
      },
      reactions: {
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true,
              level: true,
              gender: true
            }
          }
        }
      },
      readReceipts: {
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true,
              level: true,
              gender: true
            }
          }
        }
      }
    };
  }

  static async createMessage(data: {
    chatContextType: ChatContextType;
    contextId: string;
    senderId: string;
    content?: string;
    mediaUrls: string[];
    replyToId?: string;
    chatType: ChatType;
  }) {
    const { chatContextType, contextId, senderId, content, mediaUrls, replyToId, chatType } = data;

    // Validate access based on context type
    let game, participant, bug, userChat;
    
    if (chatContextType === 'GAME') {
      const result = await this.validateGameAccess(contextId, senderId);
      game = result.game;
      participant = result.participant;
      await this.validateChatTypeAccess(participant, chatType, game);
    } else if (chatContextType === 'BUG') {
      const result = await this.validateBugAccess(contextId, senderId);
      bug = result.bug;
    } else if (chatContextType === 'USER') {
      const result = await this.validateUserChatAccess(contextId, senderId);
      userChat = result.userChat;
    }

    if (replyToId) {
      const replyToMessage = await prisma.chatMessage.findFirst({
        where: {
          id: replyToId,
          chatContextType,
          contextId
        }
      });

      if (!replyToMessage) {
        throw new ApiError(404, 'Reply message not found');
      }
    }

    const thumbnailUrls = this.generateThumbnailUrls(mediaUrls);

    const message = await prisma.chatMessage.create({
      data: {
        chatContextType,
        contextId,
        gameId: chatContextType === 'GAME' ? contextId : null,
        senderId,
        content,
        mediaUrls,
        thumbnailUrls,
        replyToId,
        chatType,
        state: MessageState.SENT
      },
      include: this.getMessageInclude()
    });

    // Handle game-specific logic
    if (chatContextType === 'GAME' && game) {
      if (chatType === ChatType.PHOTOS && mediaUrls.length > 0) {
        await prisma.game.update({
          where: { id: contextId },
          data: {
            photosCount: {
              increment: mediaUrls.length
            }
          }
        });

        // Emit game update to refresh photosCount
        try {
          const socketService = (global as any).socketService;
          if (socketService) {
            const fullGame = await GameReadService.getGameById(contextId, senderId);
            if (fullGame) {
              await socketService.emitGameUpdate(contextId, senderId, fullGame);
            }
          }
        } catch (error) {
          console.error('Failed to emit game update after photo upload:', error);
        }
      }

      const gameWithDetails = await prisma.game.findUnique({
        where: { id: contextId },
        include: {
          court: {
            include: {
              club: true
            }
          },
          club: true
        }
      });

      if (gameWithDetails && message.sender) {
        telegramNotificationService.sendGameChatNotification(message, gameWithDetails, message.sender).catch(error => {
          console.error('Failed to send Telegram notification:', error);
        });
      }
    } else if (chatContextType === 'BUG' && bug && message.sender) {
      telegramNotificationService.sendBugChatNotification(message, bug, message.sender).catch(error => {
        console.error('Failed to send Telegram notification:', error);
      });
    } else if (chatContextType === 'USER' && userChat) {
      await UserChatService.updateChatTimestamp(contextId);
    }

    return message;
  }

  static async createMessageWithEvent(data: {
    chatContextType: ChatContextType;
    contextId: string;
    senderId: string;
    content?: string;
    mediaUrls: string[];
    replyToId?: string;
    chatType: ChatType;
  }) {
    const message = await this.createMessage(data);
    
    const socketService = (global as any).socketService;
    if (socketService) {
      if (data.chatContextType === 'GAME') {
        socketService.emitNewMessage(data.contextId, message);
      } else if (data.chatContextType === 'BUG') {
        socketService.emitNewBugMessage(data.contextId, message);
      } else if (data.chatContextType === 'USER') {
        socketService.emitNewUserMessage(data.contextId, message);
      }
    }
    
    return message;
  }

  static async getMessages(
    chatContextType: ChatContextType,
    contextId: string,
    userId: string,
    options: {
      page?: number;
      limit?: number;
      chatType?: ChatType;
    }
  ) {
    const { page = 1, limit = 50, chatType = ChatType.PUBLIC } = options;

    // Validate access based on context type
    if (chatContextType === 'GAME') {
      const { participant, game } = await this.validateGameAccess(contextId, userId);
      await this.validateChatTypeAccess(participant, chatType, game);
    } else if (chatContextType === 'BUG') {
      await this.validateBugAccess(contextId, userId);
    } else if (chatContextType === 'USER') {
      await this.validateUserChatAccess(contextId, userId);
    }

    const skip = (Number(page) - 1) * Number(limit);

    const messages = await prisma.chatMessage.findMany({
      where: { 
        chatContextType,
        contextId,
        chatType: chatType as ChatType
      },
      include: this.getMessageInclude(),
      orderBy: { createdAt: 'desc' },
      skip,
      take: Number(limit)
    });

    return messages.reverse();
  }

  static async updateMessageState(messageId: string, userId: string, state: MessageState) {
    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId }
    });

    if (!message) {
      throw new ApiError(404, 'Message not found');
    }

    // Validate access based on context type
    if (message.chatContextType === 'GAME') {
      await this.validateGameAccess(message.contextId, userId);
    } else if (message.chatContextType === 'BUG') {
      await this.validateBugAccess(message.contextId, userId);
    } else if (message.chatContextType === 'USER') {
      await this.validateUserChatAccess(message.contextId, userId);
    }

    return await prisma.chatMessage.update({
      where: { id: messageId },
      data: { state },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            level: true,
            gender: true,
          }
        },
        reactions: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
                level: true,
                gender: true
              }
            }
          }
        }
      }
    });
  }

  static async deleteMessage(messageId: string, userId: string) {
    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId }
    });

    if (!message) {
      throw new ApiError(404, 'Message not found');
    }

    if (message.senderId !== userId) {
      throw new ApiError(403, 'You can only delete your own messages');
    }

    // Validate access based on context type
    if (message.chatContextType === 'GAME') {
      await this.validateGameAccess(message.contextId, userId);
    } else if (message.chatContextType === 'BUG') {
      await this.validateBugAccess(message.contextId, userId);
    } else if (message.chatContextType === 'USER') {
      await this.validateUserChatAccess(message.contextId, userId);
    }

    if (message.mediaUrls && message.mediaUrls.length > 0) {
        const { ImageProcessor } = await import('../../utils/imageProcessor');
      for (const mediaUrl of message.mediaUrls) {
        try {
          await ImageProcessor.deleteFile(mediaUrl);
        } catch (error) {
          console.error(`Error deleting media file ${mediaUrl}:`, error);
        }
      }
    }

    if (message.thumbnailUrls && message.thumbnailUrls.length > 0) {
        const { ImageProcessor } = await import('../../utils/imageProcessor');
      for (const thumbnailUrl of message.thumbnailUrls) {
        try {
          await ImageProcessor.deleteFile(thumbnailUrl);
        } catch (error) {
          console.error(`Error deleting thumbnail file ${thumbnailUrl}:`, error);
        }
      }
    }

    await prisma.chatMessage.delete({
      where: { id: messageId }
    });

    // Handle game-specific photo count update
    if (message.chatContextType === 'GAME' && message.chatType === ChatType.PHOTOS && message.mediaUrls.length > 0) {
      await prisma.game.update({
        where: { id: message.contextId },
        data: {
          photosCount: {
            decrement: message.mediaUrls.length
          }
        }
      });

      // Emit game update to refresh photosCount
      try {
        const socketService = (global as any).socketService;
        if (socketService) {
          const fullGame = await GameReadService.getGameById(message.contextId, userId);
          if (fullGame) {
            await socketService.emitGameUpdate(message.contextId, userId, fullGame);
          }
        }
      } catch (error) {
        console.error('Failed to emit game update after photo deletion:', error);
      }
    }

    return message;
  }

  static async getUserChatGames(userId: string) {
    return await prisma.game.findMany({
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
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
                level: true,
                gender: true
              }
            }
          }
        },
        court: {
          include: {
            club: {
              select: {
                name: true,
                city: {
                  select: {
                    name: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: {
        startTime: 'desc'
      }
    });
  }
}

