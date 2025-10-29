import prisma from '../../config/database';
import { MessageState, ChatType } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';

export class BugMessageService {
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

  static async validateChatTypeAccess(_bug: any, _chatType: ChatType, _userId: string) {
    // For bugs, we might want different access rules
    // For now, let's keep it simple - sender and admins can access all chat types
    // We can refine this later if needed
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
    bugId: string;
    senderId: string;
    content?: string;
    mediaUrls: string[];
    replyToId?: string;
    chatType: ChatType;
  }) {
    const { bugId, senderId, content, mediaUrls, replyToId, chatType } = data;

    const { bug } = await this.validateBugAccess(bugId, senderId);
    await this.validateChatTypeAccess(bug, chatType, senderId);

    if (replyToId) {
      const replyToMessage = await prisma.bugMessage.findFirst({
        where: {
          id: replyToId,
          bugId: bugId
        }
      });

      if (!replyToMessage) {
        throw new ApiError(404, 'Reply message not found');
      }
    }

    const thumbnailUrls = this.generateThumbnailUrls(mediaUrls);

    return await prisma.bugMessage.create({
      data: {
        bugId,
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

  static async getMessages(bugId: string, userId: string, options: {
    page?: number;
    limit?: number;
    chatType?: ChatType;
  }) {
    const { page = 1, limit = 50, chatType = ChatType.PUBLIC } = options;

    const { bug } = await this.validateBugAccess(bugId, userId);
    await this.validateChatTypeAccess(bug, chatType, userId);

    const skip = (Number(page) - 1) * Number(limit);

    const messages = await prisma.bugMessage.findMany({
      where: {
        bugId,
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
    const message = await prisma.bugMessage.findUnique({
      where: { id: messageId },
      include: {
        bug: {
          include: {
            sender: true
          }
        }
      }
    });

    if (!message) {
      throw new ApiError(404, 'Message not found');
    }

    await this.validateBugAccess(message.bugId, userId);

    return await prisma.bugMessage.update({
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
    const message = await prisma.bugMessage.findUnique({
      where: { id: messageId },
      include: {
        bug: {
          include: {
            sender: true
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

    await this.validateBugAccess(message.bugId, userId);

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

    await prisma.bugMessage.delete({
      where: { id: messageId }
    });

    return message;
  }

  static async getUserBugChats(userId: string) {
    return await prisma.bug.findMany({
      where: {
        OR: [
          {
            senderId: userId
          }
        ]
      },
      include: {
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
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
  }
}
