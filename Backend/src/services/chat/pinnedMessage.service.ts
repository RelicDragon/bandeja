import prisma from '../../config/database';
import { ChatContextType, ChatType } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';
import { MessageService } from './message.service';
import { TranslationService } from './translation.service';

export class PinnedMessageService {
  static async getPinnedMessages(
    chatContextType: ChatContextType,
    contextId: string,
    chatType: ChatType,
    userId: string
  ) {
    if (chatContextType === 'GAME') {
      await MessageService.validateGameAccess(contextId, userId);
    } else if (chatContextType === 'BUG') {
      await MessageService.validateBugAccess(contextId, userId);
    } else if (chatContextType === 'USER') {
      await MessageService.validateUserChatAccess(contextId, userId);
    } else if (chatContextType === 'GROUP') {
      await MessageService.validateGroupChannelAccess(contextId, userId);
    }

    const pins = await prisma.pinnedMessage.findMany({
      where: {
        chatContextType,
        contextId,
        chatType
      },
      orderBy: { order: 'asc' },
      include: {
        message: {
          include: MessageService.getMessageInclude()
        }
      }
    });

    const messages = pins.map((p) => p.message);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { language: true }
    });
    const languageCode = user ? TranslationService.extractLanguageCode(user.language) : 'en';
    return MessageService.enrichMessagesWithTranslations(messages, languageCode);
  }

  static async pinMessage(messageId: string, userId: string) {
    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId }
    });

    if (!message) {
      throw new ApiError(404, 'Message not found');
    }

    await MessageService.validateMessageAccess(message, userId, true);

    const existing = await prisma.pinnedMessage.findUnique({
      where: {
        chatContextType_contextId_chatType_messageId: {
          chatContextType: message.chatContextType,
          contextId: message.contextId,
          chatType: message.chatType,
          messageId: message.id
        }
      }
    });

    if (existing) {
      return existing;
    }

    const maxOrder = await prisma.pinnedMessage.aggregate({
      where: {
        chatContextType: message.chatContextType,
        contextId: message.contextId,
        chatType: message.chatType
      },
      _max: { order: true }
    });

    const pin = await prisma.pinnedMessage.create({
      data: {
        chatContextType: message.chatContextType,
        contextId: message.contextId,
        chatType: message.chatType,
        messageId: message.id,
        order: (maxOrder._max.order ?? -1) + 1,
        pinnedById: userId
      }
    });

    this.emitPinnedUpdated(message.chatContextType, message.contextId, message.chatType);
    return pin;
  }

  static async unpinMessage(messageId: string, userId: string) {
    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId }
    });

    if (!message) {
      throw new ApiError(404, 'Message not found');
    }

    await MessageService.validateMessageAccess(message, userId, true);

    await prisma.pinnedMessage.deleteMany({
      where: {
        chatContextType: message.chatContextType,
        contextId: message.contextId,
        chatType: message.chatType,
        messageId: message.id
      }
    });

    this.emitPinnedUpdated(message.chatContextType, message.contextId, message.chatType);
  }

  private static emitPinnedUpdated(
    contextType: ChatContextType,
    contextId: string,
    chatType: ChatType
  ) {
    try {
      const socketService = (global as any).socketService;
      if (socketService) {
        socketService.emitPinnedMessagesUpdated(contextType, contextId, chatType);
      }
    } catch { /* ignore */ }
  }
}
