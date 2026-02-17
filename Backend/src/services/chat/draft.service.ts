import prisma from '../../config/database';
import { ChatContextType, ChatType } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';

const MAX_CONTENT_LENGTH = 10000;
const MAX_MENTION_IDS = 50;
const DRAFT_EXPIRY_DAYS = 30;
const MAX_DRAFTS_PER_USER = 1000;

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

    await this.enforceMaxDraftsPerUser(userId);
    return draft;
  }

  static async enforceMaxDraftsPerUser(userId: string) {
    const count = await prisma.chatDraft.count({ where: { userId } });
    if (count <= MAX_DRAFTS_PER_USER) return;
    const toRemove = await prisma.chatDraft.findMany({
      where: { userId },
      orderBy: { updatedAt: 'asc' },
      take: count - MAX_DRAFTS_PER_USER,
      select: { id: true }
    });
    if (toRemove.length > 0) {
      await prisma.chatDraft.deleteMany({
        where: { id: { in: toRemove.map((d) => d.id) } }
      });
    }
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

  static async deleteDraftsOlderThan(days: number = DRAFT_EXPIRY_DAYS) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    await prisma.chatDraft.deleteMany({
      where: {
        updatedAt: { lt: cutoff }
      }
    });
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
    await prisma.chatDraft.deleteMany({
      where: {
        userId,
        chatContextType,
        contextId,
        chatType
      }
    });
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
