import prisma from '../../config/database';
import { ChatContextType } from '@prisma/client';

export class ChatMuteService {
  static async muteChat(userId: string, chatContextType: ChatContextType, contextId: string) {
    const chatMute = await prisma.chatMute.upsert({
      where: {
        userId_chatContextType_contextId: {
          userId,
          chatContextType,
          contextId
        }
      },
      update: {
        updatedAt: new Date()
      },
      create: {
        userId,
        chatContextType,
        contextId
      }
    });

    return chatMute;
  }

  static async unmuteChat(userId: string, chatContextType: ChatContextType, contextId: string) {
    await prisma.chatMute.delete({
      where: {
        userId_chatContextType_contextId: {
          userId,
          chatContextType,
          contextId
        }
      }
    }).catch(() => {
      // Ignore if not muted
    });

    return { success: true };
  }

  static async isChatMuted(userId: string, chatContextType: ChatContextType, contextId: string): Promise<boolean> {
    const chatMute = await prisma.chatMute.findUnique({
      where: {
        userId_chatContextType_contextId: {
          userId,
          chatContextType,
          contextId
        }
      }
    });

    return !!chatMute;
  }

  static async getMutedChats(userId: string, chatContextType?: ChatContextType) {
    const where: any = { userId };
    if (chatContextType) {
      where.chatContextType = chatContextType;
    }

    const mutedChats = await prisma.chatMute.findMany({
      where,
      orderBy: {
        updatedAt: 'desc'
      }
    });

    return mutedChats;
  }
}

