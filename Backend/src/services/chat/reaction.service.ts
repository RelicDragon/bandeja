import prisma from '../../config/database';
import { ChatSyncEventType } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';
import { MessageService } from './message.service';
import { USER_SELECT_FIELDS } from '../../utils/constants';
import { ChatSyncEventService } from './chatSyncEvent.service';
import { assertValidReactionEmoji, normalizeReactionEmoji } from '../../utils/validateReactionEmoji';
import { UserReactionEmojiUsageService } from '../user/userReactionEmojiUsage.service';

export class ReactionService {
  static async addReaction(messageId: string, userId: string, emoji: string) {
    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new ApiError(404, 'Message not found');
    }

    if (message.deletedAt) {
      throw new ApiError(404, 'Message not found');
    }

    await MessageService.validateMessageAccess(message, userId, true);

    const normalizedEmoji = assertValidReactionEmoji(emoji);

    return prisma.$transaction(async (tx) => {
      const existing = await tx.messageReaction.findUnique({
        where: {
          messageId_userId: {
            messageId,
            userId,
          },
        },
        select: { emoji: true },
      });
      const previousEmoji = existing?.emoji != null ? normalizeReactionEmoji(existing.emoji) : null;

      const reaction = await tx.messageReaction.upsert({
        where: {
          messageId_userId: {
            messageId,
            userId,
          },
        },
        create: {
          messageId,
          userId,
          emoji: normalizedEmoji,
        },
        update: {
          emoji: normalizedEmoji,
        },
        include: {
          user: {
            select: USER_SELECT_FIELDS,
          },
        },
      });

      const emojiUsage = await UserReactionEmojiUsageService.recordUseIfChanged(tx, {
        userId,
        emoji: normalizedEmoji,
        previousEmoji,
      });

      const syncSeq = await ChatSyncEventService.appendEventInTransaction(
        tx,
        message.chatContextType,
        message.contextId,
        ChatSyncEventType.REACTION_ADDED,
        { reaction }
      );
      return { reaction, syncSeq, emojiUsage };
    });
  }

  static async removeReaction(messageId: string, userId: string) {
    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new ApiError(404, 'Message not found');
    }

    if (message.deletedAt) {
      throw new ApiError(404, 'Message not found');
    }

    await MessageService.validateMessageAccess(message, userId, true);

    return prisma.$transaction(async (tx) => {
      await tx.messageReaction.deleteMany({
        where: {
          messageId,
          userId,
        },
      });
      const syncSeq = await ChatSyncEventService.appendEventInTransaction(
        tx,
        message.chatContextType,
        message.contextId,
        ChatSyncEventType.REACTION_REMOVED,
        { messageId, userId, action: 'removed' }
      );
      return { messageId, userId, action: 'removed' as const, syncSeq };
    });
  }
}
