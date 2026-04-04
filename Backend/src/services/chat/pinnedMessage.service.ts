import prisma from '../../config/database';
import { ChatContextType, ChatSyncEventType, ChatType } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';
import { MessageService } from './message.service';
import { TranslationService } from './translation.service';
import { ChatSyncEventService } from './chatSyncEvent.service';

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
        chatType,
        message: { deletedAt: null },
      },
      orderBy: { order: 'asc' },
      include: {
        message: {
          include: MessageService.getMessageInclude()
        }
      }
    });

    const messages = pins.map((p) => p.message).filter(Boolean);
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

    if (message.deletedAt) {
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

    const nextOrder = (maxOrder._max.order ?? -1) + 1;
    let pinSyncSeq: number | undefined;
    const pin = await prisma.$transaction(async (tx) => {
      const created = await tx.pinnedMessage.create({
        data: {
          chatContextType: message.chatContextType,
          contextId: message.contextId,
          chatType: message.chatType,
          messageId: message.id,
          order: nextOrder,
          pinnedById: userId
        }
      });
      pinSyncSeq = await ChatSyncEventService.appendEventInTransaction(
        tx,
        message.chatContextType,
        message.contextId,
        ChatSyncEventType.MESSAGE_PINNED,
        {
          messageId: message.id,
          chatType: message.chatType,
          order: created.order,
          pinnedById: userId,
        }
      );
      return created;
    });

    this.emitPinnedUpdated(message.chatContextType, message.contextId, message.chatType, pinSyncSeq);
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

    let unpinSyncSeq: number | undefined;
    const removed = await prisma.$transaction(async (tx) => {
      const del = await tx.pinnedMessage.deleteMany({
        where: {
          chatContextType: message.chatContextType,
          contextId: message.contextId,
          chatType: message.chatType,
          messageId: message.id
        }
      });
      if (del.count > 0) {
        unpinSyncSeq = await ChatSyncEventService.appendEventInTransaction(
          tx,
          message.chatContextType,
          message.contextId,
          ChatSyncEventType.MESSAGE_UNPINNED,
          { messageId: message.id, chatType: message.chatType }
        );
      }
      return del.count;
    });

    if (removed > 0) {
      this.emitPinnedUpdated(message.chatContextType, message.contextId, message.chatType, unpinSyncSeq);
    }
  }

  private static emitPinnedUpdated(
    contextType: ChatContextType,
    contextId: string,
    chatType: ChatType,
    syncSeq?: number
  ) {
    try {
      const socketService = (global as any).socketService;
      if (socketService) {
        socketService.emitPinnedMessagesUpdated(contextType, contextId, chatType, syncSeq);
      }
    } catch { /* ignore */ }
  }
}
