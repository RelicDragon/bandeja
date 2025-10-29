import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { BugMessageService } from './bugMessage.service';
import { USER_SELECT_FIELDS } from '../../utils/constants';

export class BugReactionService {
  static async addReaction(messageId: string, userId: string, emoji: string) {
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

    await BugMessageService.validateBugAccess(message.bugId, userId);

    let reaction;
    try {
      reaction = await prisma.bugMessageReaction.create({
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
        await prisma.bugMessageReaction.updateMany({
          where: {
            messageId,
            userId
          },
          data: {
            emoji
          }
        });

        reaction = await prisma.bugMessageReaction.findFirst({
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

    await BugMessageService.validateBugAccess(message.bugId, userId);

    await prisma.bugMessageReaction.deleteMany({
      where: {
        messageId,
        userId
      }
    });

    return { messageId, userId, action: 'removed' };
  }
}
