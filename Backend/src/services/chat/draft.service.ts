import prisma from '../../config/database';
import { ChatContextType, ChatType } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';

const MAX_CONTENT_LENGTH = 10000;
const MAX_MENTION_IDS = 50;
const DEFAULT_DRAFT_EXPIRY_DAYS = 30;
const MAX_DRAFTS_PER_USER = 1000;

function getDraftExpiryDays(): number {
  const env = process.env.DRAFT_EXPIRY_DAYS;
  if (env == null || env === '') return DEFAULT_DRAFT_EXPIRY_DAYS;
  const n = parseInt(env, 10);
  return Number.isFinite(n) && n >= 1 ? n : DEFAULT_DRAFT_EXPIRY_DAYS;
}

export class DraftService {
  static async saveDraft(
    userId: string,
    chatContextType: ChatContextType,
    contextId: string,
    chatType: ChatType,
    content?: string,
    mentionIds: string[] = []
  ) {
    const rawContent = typeof content === 'string' ? content : '';
    const trimmedContent = rawContent.trim().slice(0, MAX_CONTENT_LENGTH);
    if (rawContent.length > MAX_CONTENT_LENGTH) {
      throw new ApiError(400, `Draft content cannot exceed ${MAX_CONTENT_LENGTH} characters`);
    }

    if (mentionIds.length > MAX_MENTION_IDS) {
      throw new ApiError(400, `Cannot mention more than ${MAX_MENTION_IDS} users`);
    }

    if (mentionIds.length > 0) {
      const validUserIds = await prisma.user.findMany({
        where: { id: { in: mentionIds } },
        select: { id: true }
      });
      const validIds = new Set(validUserIds.map(u => u.id));
      const invalidIds = mentionIds.filter(id => !validIds.has(id));
      if (invalidIds.length > 0) {
        throw new ApiError(400, `Invalid user IDs: ${invalidIds.join(', ')}`);
      }
    }

    const contentToStore = trimmedContent || null;
    const mentionIdsToStore = mentionIds || [];

    const draft = await prisma.$transaction(async (tx) => {
      const row = await tx.chatDraft.upsert({
        where: {
          userId_chatContextType_contextId_chatType: {
            userId,
            chatContextType,
            contextId,
            chatType
          }
        },
        update: { content: contentToStore, mentionIds: mentionIdsToStore },
        create: {
          userId,
          chatContextType,
          contextId,
          chatType,
          content: contentToStore,
          mentionIds: mentionIdsToStore
        }
      });

      const count = await tx.chatDraft.count({ where: { userId } });
      if (count > MAX_DRAFTS_PER_USER) {
        const toRemove = await tx.chatDraft.findMany({
          where: { userId },
          orderBy: { updatedAt: 'asc' },
          take: count - MAX_DRAFTS_PER_USER,
          select: { id: true }
        });
        if (toRemove.length > 0) {
          await tx.chatDraft.deleteMany({
            where: { id: { in: toRemove.map((d) => d.id) } }
          });
        }
      }
      return row;
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

  static readonly EXPIRY_BATCH_SIZE = 1000;

  static async deleteDraftsOlderThan(days?: number): Promise<number> {
    const expiryDays = days ?? getDraftExpiryDays();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - expiryDays);
    let totalDeleted = 0;
    for (;;) {
      const toDelete = await prisma.chatDraft.findMany({
        where: { updatedAt: { lt: cutoff } },
        take: this.EXPIRY_BATCH_SIZE,
        select: { id: true }
      });
      if (toDelete.length === 0) break;
      await prisma.chatDraft.deleteMany({
        where: { id: { in: toDelete.map((d) => d.id) } }
      });
      totalDeleted += toDelete.length;
      if (toDelete.length < this.EXPIRY_BATCH_SIZE) break;
    }
    return totalDeleted;
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
}
