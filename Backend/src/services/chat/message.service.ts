import prisma from '../../config/database';
import { MessageState, ChatType } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';

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

  static async validateChatTypeAccess(participant: any, chatType: ChatType) {
    if (chatType === ChatType.PRIVATE && (!participant || !participant.isPlaying)) {
      throw new ApiError(403, 'Only playing participants can access private chat');
    }

    if (chatType === ChatType.ADMINS && (!participant || (participant.role !== 'OWNER' && participant.role !== 'ADMIN'))) {
      throw new ApiError(403, 'Only game owners and admins can access admin chat');
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
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatar: true,
          level: true,
          gender: true,
        }
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
    gameId: string;
    senderId: string;
    content: string;
    mediaUrls: string[];
    replyToId?: string;
    chatType: ChatType;
  }) {
    const { gameId, senderId, content, mediaUrls, replyToId, chatType } = data;

    const { participant } = await this.validateGameAccess(gameId, senderId);
    await this.validateChatTypeAccess(participant, chatType);

    if (replyToId) {
      const replyToMessage = await prisma.chatMessage.findFirst({
        where: {
          id: replyToId,
          gameId: gameId
        }
      });

      if (!replyToMessage) {
        throw new ApiError(404, 'Reply message not found');
      }
    }

    const thumbnailUrls = this.generateThumbnailUrls(mediaUrls);

    return await prisma.chatMessage.create({
      data: {
        gameId,
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
  }

  static async getMessages(gameId: string, userId: string, options: {
    page?: number;
    limit?: number;
    chatType?: ChatType;
  }) {
    const { page = 1, limit = 50, chatType = ChatType.PUBLIC } = options;

    const { participant } = await this.validateGameAccess(gameId, userId);
    await this.validateChatTypeAccess(participant, chatType);

    const skip = (Number(page) - 1) * Number(limit);

    const messages = await prisma.chatMessage.findMany({
      where: { 
        gameId,
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

    await this.validateGameAccess(message.gameId, userId);

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
            },
          }
        }
      }
    });

    if (!message) {
      throw new ApiError(404, 'Message not found');
    }

    if (message.senderId !== userId) {
      throw new ApiError(403, 'You can only delete your own messages');
    }

    await this.validateGameAccess(message.gameId, userId);

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
