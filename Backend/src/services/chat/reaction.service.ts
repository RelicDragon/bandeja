import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { MessageService } from './message.service';
import { USER_SELECT_FIELDS } from '../../utils/constants';

export class ReactionService {
  static async addReaction(messageId: string, userId: string, emoji: string) {
    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId }
    });

    if (!message) {
      throw new ApiError(404, 'Message not found');
    }

    await MessageService.validateMessageAccess(message, userId, true);

    // Use upsert to atomically create or update the reaction
    const reaction = await prisma.messageReaction.upsert({
      where: {
        messageId_userId: {
          messageId,
          userId
        }
      },
      create: {
        messageId,
        userId,
        emoji
      },
      update: {
        emoji
      },
      include: {
        user: {
          select: USER_SELECT_FIELDS
        }
      }
    });

    return reaction;
  }

  static async removeReaction(messageId: string, userId: string) {
    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId }
    });

    if (!message) {
      throw new ApiError(404, 'Message not found');
    }

    await MessageService.validateMessageAccess(message, userId, true);

    await prisma.messageReaction.deleteMany({
      where: {
        messageId,
        userId
      }
    });

    return { messageId, userId, action: 'removed' };
  }
}
