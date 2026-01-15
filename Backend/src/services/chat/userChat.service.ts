import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { USER_SELECT_FIELDS } from '../../utils/constants';

export class UserChatService {
  static async getUserChats(userId: string) {
    const chats = await prisma.userChat.findMany({
      where: {
        OR: [
          { user1Id: userId },
          { user2Id: userId }
        ]
      },
      include: {
        user1: {
          select: USER_SELECT_FIELDS
        },
        user2: {
          select: USER_SELECT_FIELDS
        },
        pinnedByUsers: {
          where: {
            userId
          }
        }
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });

    // Get last message for each chat
    const chatsWithLastMessage = await Promise.all(
      chats.map(async (chat) => {
        const lastMessage = await prisma.chatMessage.findFirst({
          where: {
            chatContextType: 'USER',
            contextId: chat.id,
            senderId: { not: null }
          },
          orderBy: { createdAt: 'desc' },
          include: {
            sender: {
              select: USER_SELECT_FIELDS
            }
          }
        });

        return {
          ...chat,
          lastMessage,
          isPinned: chat.pinnedByUsers.length > 0
        };
      })
    );

    return chatsWithLastMessage;
  }

  static async getOrCreateChatWithUser(currentUserId: string, otherUserId: string) {
    if (currentUserId === otherUserId) {
      throw new ApiError(400, 'Cannot create chat with yourself');
    }

    // Ensure consistent ordering (smaller ID first)
    const [id1, id2] = [currentUserId, otherUserId].sort();
    
    let userChat = await prisma.userChat.findUnique({
      where: {
        user1Id_user2Id: {
          user1Id: id1,
          user2Id: id2
        }
      },
      include: {
        user1: { select: USER_SELECT_FIELDS },
        user2: { select: USER_SELECT_FIELDS }
      }
    });

    if (!userChat) {
      userChat = await prisma.userChat.create({
        data: {
          user1Id: id1,
          user2Id: id2
        },
        include: {
          user1: { select: USER_SELECT_FIELDS },
          user2: { select: USER_SELECT_FIELDS }
        }
      });
    }

    return userChat;
  }

  static async getChatById(chatId: string, userId: string) {
    const chat = await prisma.userChat.findUnique({
      where: { id: chatId },
      include: {
        user1: { select: USER_SELECT_FIELDS },
        user2: { select: USER_SELECT_FIELDS }
      }
    });

    if (!chat) {
      throw new ApiError(404, 'Chat not found');
    }

    if (chat.user1Id !== userId && chat.user2Id !== userId) {
      throw new ApiError(403, 'Access denied');
    }

    return chat;
  }

  static async updateChatTimestamp(chatId: string) {
    await prisma.userChat.update({
      where: { id: chatId },
      data: { updatedAt: new Date() }
    });
  }

  static async pinUserChat(userId: string, chatId: string) {
    await this.getChatById(chatId, userId);

    const pinnedChat = await prisma.pinnedUserChat.upsert({
      where: {
        userId_userChatId: {
          userId,
          userChatId: chatId
        }
      },
      update: {
        pinnedAt: new Date()
      },
      create: {
        userId,
        userChatId: chatId
      }
    });

    return pinnedChat;
  }

  static async unpinUserChat(userId: string, chatId: string) {
    await this.getChatById(chatId, userId);

    await prisma.pinnedUserChat.delete({
      where: {
        userId_userChatId: {
          userId,
          userChatId: chatId
        }
      }
    }).catch(() => {
      // Ignore if not pinned
    });

    return { success: true };
  }
}

