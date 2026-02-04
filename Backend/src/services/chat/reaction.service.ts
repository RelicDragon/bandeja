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

    let reaction;
    try {
      reaction = await prisma.messageReaction.create({
        data: {
          messageId,
          userId,
          emoji
        },
        include: {
          user: {
            select: USER_SELECT_FIELDS
          }
        }
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        await prisma.messageReaction.updateMany({
          where: {
            messageId,
            userId
          },
          data: {
            emoji
          }
        });

        reaction = await prisma.messageReaction.findFirst({
          where: {
            messageId,
            userId
          },
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
        });
      } else {
        throw error;
      }
    }

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
