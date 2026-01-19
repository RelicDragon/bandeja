import prisma from '../../config/database';
import { ChatContextType, ChatType } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';

const MAX_CONTENT_LENGTH = 10000;
const MAX_MENTION_IDS = 50;

export class DraftService {
  static async saveDraft(
    userId: string,
    chatContextType: ChatContextType,
    contextId: string,
    chatType: ChatType,
    content?: string,
    mentionIds: string[] = []
  ) {
    if (content && content.length > MAX_CONTENT_LENGTH) {
      throw new ApiError(400, `Draft content cannot exceed ${MAX_CONTENT_LENGTH} characters`);
    }

    if (mentionIds.length > MAX_MENTION_IDS) {
      throw new ApiError(400, `Cannot mention more than ${MAX_MENTION_IDS} users`);
    }

    if (mentionIds.length > 0) {
      const validUserIds = await prisma.user.findMany({
        where: {
          id: { in: mentionIds }
        },
        select: { id: true }
      });

      const validIds = new Set(validUserIds.map(u => u.id));
      const invalidIds = mentionIds.filter(id => !validIds.has(id));

      if (invalidIds.length > 0) {
        throw new ApiError(400, `Invalid user IDs: ${invalidIds.join(', ')}`);
      }
    }

    const draft = await prisma.chatDraft.upsert({
      where: {
        userId_chatContextType_contextId_chatType: {
          userId,
          chatContextType,
          contextId,
          chatType
        }
      },
      update: {
        content: content || null,
        mentionIds: mentionIds || []
      },
      create: {
        userId,
        chatContextType,
        contextId,
        chatType,
        content: content || null,
        mentionIds: mentionIds || []
      }
    });

    return draft;
  }

  static async getDraft(
    userId: string,
    chatContextType: ChatContextType,
    contextId: string,
    chatType: ChatType
  ) {
    const draft = await prisma.chatDraft.findUnique({
      where: {
        userId_chatContextType_contextId_chatType: {
          userId,
          chatContextType,
          contextId,
          chatType
        }
      }
    });

    return draft;
  }

  static async getUserDrafts(userId: string, page: number = 1, limit: number = 50) {
    const skip = (page - 1) * limit;
    
    const [drafts, total] = await Promise.all([
      prisma.chatDraft.findMany({
        where: {
          userId
        },
        orderBy: {
          updatedAt: 'desc'
        },
        skip,
        take: limit
      }),
      prisma.chatDraft.count({
        where: {
          userId
        }
      })
    ]);

    return {
      drafts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  static async deleteDraft(
    userId: string,
    chatContextType: ChatContextType,
    contextId: string,
    chatType: ChatType
  ) {
    try {
      await prisma.chatDraft.delete({
        where: {
          userId_chatContextType_contextId_chatType: {
            userId,
            chatContextType,
            contextId,
            chatType
          }
        }
      });
    } catch (error: any) {
      if (error.code === 'P2025') {
        return;
      }
      throw error;
    }
  }

  static async clearDraft(
    userId: string,
    chatContextType: ChatContextType,
    contextId: string,
    chatType: ChatType
  ) {
    await this.deleteDraft(userId, chatContextType, contextId, chatType);
  }
}
