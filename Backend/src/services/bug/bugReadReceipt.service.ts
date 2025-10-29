import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { BugMessageService } from './bugMessage.service';

export class BugReadReceiptService {
  static async markMessageAsRead(messageId: string, userId: string) {
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

    await prisma.bugMessageReadReceipt.upsert({
      where: {
        messageId_userId: {
          messageId,
          userId
        }
      },
      update: {
        readAt: new Date()
      },
      create: {
        messageId,
        userId,
        readAt: new Date()
      }
    });

    return {
      messageId,
      userId,
      readAt: new Date()
    };
  }

  static async getUnreadCount(userId: string) {
    const userBugs = await prisma.bug.findMany({
      where: {
        OR: [
          {
            senderId: userId
          }
        ]
      }
    });

    if (userBugs.length === 0) {
      return { count: 0 };
    }

    // For bugs, we might want different logic for unread counts
    // For now, let's count all unread messages in user's bugs
    const unreadCount = await prisma.bugMessage.count({
      where: {
        bugId: {
          in: userBugs.map(bug => bug.id)
        },
        senderId: {
          not: userId
        },
        readReceipts: {
          none: {
            userId
          }
        }
      }
    });

    return { count: unreadCount };
  }

  static async getBugUnreadCount(bugId: string, userId: string) {
    await BugMessageService.validateBugAccess(bugId, userId);

    const unreadCount = await prisma.bugMessage.count({
      where: {
        bugId,
        senderId: {
          not: userId
        },
        readReceipts: {
          none: {
            userId
          }
        }
      }
    });

    return { count: unreadCount };
  }

  static async getBugsUnreadCounts(bugIds: string[], userId: string) {
    if (bugIds.length === 0) {
      return {};
    }

    // Get all bugs with access validation
    const bugs = await prisma.bug.findMany({
      where: {
        id: {
          in: bugIds
        }
      },
      include: {
        sender: true
      }
    });

    const unreadCounts: Record<string, number> = {};

    // Calculate unread count for each bug based on user's access
    for (const bug of bugs) {
      try {
        await BugMessageService.validateBugAccess(bug.id, userId);

        const bugUnreadCount = await prisma.bugMessage.count({
          where: {
            bugId: bug.id,
            senderId: {
              not: userId
            },
            readReceipts: {
              none: {
                userId
              }
            }
          }
        });

        unreadCounts[bug.id] = bugUnreadCount;
      } catch {
        // If user doesn't have access to this bug, skip it
        continue;
      }
    }

    return unreadCounts;
  }
}
