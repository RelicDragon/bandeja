import { StorySourceType } from '@prisma/client';
import prisma from '../../config/database';
import { USER_SELECT_FIELDS } from '../../utils/constants';
import { ApiError } from '../../utils/ApiError';
import {
  COMMENTS_PAGE_SIZE,
  MAX_COMMENT_BODY_LENGTH,
  maxCommentsPerSegment,
  REPLY_PAGE_SIZE,
  REPLY_PREVIEW_COUNT,
  STORY_ENGAGEMENT_ERROR,
} from './storyEngagement.constants';
import { mapCommentToDto, parseCommentLikeFlags, type StoryCommentDto } from './storyEngagement.dto';
import { emitStoryComment, emitStoryCommentDeleted } from './storyEngagement.events';
import { notifyStoryComment, notifyStoryCommentReply } from './storyEngagement.notifications';
import {
  SOCIAL_GRAPH_INTERACT_CONTEXT,
  assertCanInteract,
} from '../social-graph/socialGraph.block';
import { assertCanEngage } from './storyEngagement.permissions';
import { assertCommentRateLimit } from './storyEngagement.rateLimit';

const AUTHOR_SELECT = { ...USER_SELECT_FIELDS, isActive: true };

function normalizeBody(body: string): string {
  return body.trim();
}

function isValidCommentBody(body: string): boolean {
  const trimmed = normalizeBody(body);
  if (!trimmed) return false;
  if (trimmed.length > MAX_COMMENT_BODY_LENGTH) return false;
  if (/^[\p{Emoji}\p{Emoji_Component}\s]+$/u.test(trimmed)) return false;
  return true;
}

async function countActiveComments(sourceType: StorySourceType, sourceId: string): Promise<number> {
  return prisma.storySegmentComment.count({
    where: { sourceType, sourceId, deletedAt: null },
  });
}

export class StoryEngagementCommentService {
  static async createComment(
    viewerId: string,
    sourceType: StorySourceType,
    sourceId: string,
    ownerUserId: string,
    input: { body: string; parentId?: string | null; clientMutationId?: string | null }
  ): Promise<{ comment: StoryCommentDto; commentCount: number }> {
    await assertCanEngage(viewerId, sourceType, sourceId, ownerUserId);
    assertCommentRateLimit(viewerId);

    const user = await prisma.user.findUnique({
      where: { id: viewerId },
      select: { nameIsSet: true },
    });
    if (!user?.nameIsSet) {
      throw new ApiError(400, 'Profile name required', true, { code: 'profile.nameRequired' });
    }

    const mutationId = input.clientMutationId?.trim() || null;
    if (mutationId) {
      const existing = await prisma.storySegmentComment.findUnique({
        where: { authorId_clientMutationId: { authorId: viewerId, clientMutationId: mutationId } },
        include: {
          author: { select: AUTHOR_SELECT },
          _count: { select: { likes: true, replies: { where: { deletedAt: null } } } },
          likes: {
            where: { userId: { in: [viewerId, ownerUserId] } },
            select: { id: true, userId: true },
          },
        },
      });
      if (existing) {
        const likeFlags = parseCommentLikeFlags(existing.likes, viewerId, ownerUserId);
        const comment = mapCommentToDto(
          existing,
          ownerUserId,
          existing._count.likes,
          likeFlags.viewerHasLiked,
          likeFlags.segmentOwnerHasLiked,
          existing._count.replies
        );
        const commentCount = await countActiveComments(sourceType, sourceId);
        return { comment, commentCount };
      }
    }

    if (!isValidCommentBody(input.body)) {
      throw new ApiError(400, 'Invalid comment body', true, {
        code: STORY_ENGAGEMENT_ERROR.COMMENT_BODY_INVALID,
      });
    }

    let parentId: string | null = null;
    let parentAuthorId: string | null = null;
    if (input.parentId) {
      const parent = await prisma.storySegmentComment.findFirst({
        where: { id: input.parentId, sourceType, sourceId, parentId: null },
      });
      if (!parent || parent.deletedAt) {
        throw new ApiError(400, 'Invalid parent comment', true, {
          code: STORY_ENGAGEMENT_ERROR.COMMENT_INVALID_PARENT,
        });
      }
      await assertCanInteract(
        viewerId,
        parent.authorId,
        SOCIAL_GRAPH_INTERACT_CONTEXT.STORY_ENGAGEMENT,
      );
      parentId = parent.id;
      parentAuthorId = parent.authorId;
    }

    const commentCount = await countActiveComments(sourceType, sourceId);
    if (commentCount >= maxCommentsPerSegment()) {
      throw new ApiError(429, 'Comment cap reached', true, {
        code: STORY_ENGAGEMENT_ERROR.COMMENT_CAP_REACHED,
      });
    }

    const created = await prisma.storySegmentComment.create({
      data: {
        sourceType,
        sourceId,
        ownerUserId,
        authorId: viewerId,
        parentId,
        body: normalizeBody(input.body),
        clientMutationId: mutationId,
      },
      include: { author: { select: AUTHOR_SELECT } },
    });

    const dto = mapCommentToDto(created, ownerUserId, 0, false, false, 0);
    emitStoryComment({ comment: dto, commentCount: commentCount + 1, ownerUserId, sourceType, sourceId });

    if (parentId && parentAuthorId) {
      void notifyStoryCommentReply({
        actorId: viewerId,
        ownerUserId,
        parentAuthorId,
        sourceType,
        sourceId,
        threadRootId: parentId,
      });
    } else {
      void notifyStoryComment({ actorId: viewerId, ownerUserId, sourceType, sourceId });
    }

    return { comment: dto, commentCount: commentCount + 1 };
  }

  static async deleteComment(viewerId: string, commentId: string): Promise<{ commentCount: number }> {
    const comment = await prisma.storySegmentComment.findUnique({ where: { id: commentId } });
    if (!comment) {
      throw new ApiError(404, 'Comment not found', true, { code: STORY_ENGAGEMENT_ERROR.COMMENT_NOT_FOUND });
    }
    if (comment.deletedAt) {
      throw new ApiError(404, 'Comment not found', true, { code: STORY_ENGAGEMENT_ERROR.COMMENT_NOT_FOUND });
    }

    const isAuthor = comment.authorId === viewerId;
    const isOwner = comment.ownerUserId === viewerId;
    if (!isAuthor && !isOwner) {
      throw new ApiError(403, 'Story engagement forbidden', true, {
        code: STORY_ENGAGEMENT_ERROR.FORBIDDEN,
      });
    }

    await prisma.storySegmentComment.update({
      where: { id: commentId },
      data: { deletedAt: new Date() },
    });

    const commentCount = await countActiveComments(comment.sourceType, comment.sourceId);
    emitStoryCommentDeleted({
      commentId,
      commentCount,
      ownerUserId: comment.ownerUserId,
      sourceType: comment.sourceType,
      sourceId: comment.sourceId,
    });

    return { commentCount };
  }

  static async listTopLevelComments(
    viewerId: string,
    sourceType: StorySourceType,
    sourceId: string,
    ownerUserId: string,
    cursor?: string | null
  ): Promise<{ comments: StoryCommentDto[]; nextCursor: string | null }> {
    await assertCanEngage(viewerId, sourceType, sourceId, ownerUserId);
    const blockedIds = await this.getBlockedUserIds(viewerId);

    const cursorRow = cursor
      ? await prisma.storySegmentComment.findUnique({
          where: { id: cursor },
          select: { createdAt: true, id: true },
        })
      : null;

    const rows = await prisma.storySegmentComment.findMany({
      where: {
        sourceType,
        sourceId,
        parentId: null,
        ...(blockedIds.length > 0 ? { authorId: { notIn: blockedIds } } : {}),
        ...(cursorRow
          ? {
              OR: [
                { createdAt: { lt: cursorRow.createdAt } },
                { createdAt: cursorRow.createdAt, id: { lt: cursorRow.id } },
              ],
            }
          : {}),
      },
      include: {
        author: { select: AUTHOR_SELECT },
        _count: { select: { likes: true, replies: { where: { deletedAt: null } } } },
        likes: {
          where: { userId: { in: [viewerId, ownerUserId] } },
          select: { id: true, userId: true },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: COMMENTS_PAGE_SIZE + 1,
    });

    const hasMore = rows.length > COMMENTS_PAGE_SIZE;
    const page = hasMore ? rows.slice(0, COMMENTS_PAGE_SIZE) : rows;
    const parentIds = page.map((r) => r.id);
    const previewMap = await this.loadReplyPreviews(parentIds, viewerId, ownerUserId, blockedIds);

    return {
      comments: page.map((r) => {
        const likeFlags = parseCommentLikeFlags(r.likes, viewerId, ownerUserId);
        return mapCommentToDto(
          r,
          ownerUserId,
          r._count.likes,
          likeFlags.viewerHasLiked,
          likeFlags.segmentOwnerHasLiked,
          r._count.replies,
          previewMap.get(r.id)
        );
      }),
      nextCursor: hasMore ? page[page.length - 1]!.id : null,
    };
  }

  static async listReplies(
    viewerId: string,
    commentId: string,
    cursor?: string | null
  ): Promise<{ replies: StoryCommentDto[]; nextCursor: string | null }> {
    const parent = await prisma.storySegmentComment.findUnique({ where: { id: commentId } });
    if (!parent || parent.parentId) {
      throw new ApiError(404, 'Comment not found', true, { code: STORY_ENGAGEMENT_ERROR.COMMENT_NOT_FOUND });
    }

    await assertCanEngage(viewerId, parent.sourceType, parent.sourceId, parent.ownerUserId);
    const blockedIds = await this.getBlockedUserIds(viewerId);

    const cursorRow = cursor
      ? await prisma.storySegmentComment.findUnique({
          where: { id: cursor },
          select: { createdAt: true, id: true },
        })
      : null;

    const rows = await prisma.storySegmentComment.findMany({
      where: {
        parentId: commentId,
        ...(blockedIds.length > 0 ? { authorId: { notIn: blockedIds } } : {}),
        ...(cursorRow
          ? {
              OR: [
                { createdAt: { gt: cursorRow.createdAt } },
                { createdAt: cursorRow.createdAt, id: { gt: cursorRow.id } },
              ],
            }
          : {}),
      },
      include: {
        author: { select: AUTHOR_SELECT },
        _count: { select: { likes: true } },
        likes: {
          where: { userId: { in: [viewerId, parent.ownerUserId] } },
          select: { id: true, userId: true },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: REPLY_PAGE_SIZE + 1,
    });

    const hasMore = rows.length > REPLY_PAGE_SIZE;
    const page = hasMore ? rows.slice(0, REPLY_PAGE_SIZE) : rows;

    return {
      replies: page.map((r) => {
        const likeFlags = parseCommentLikeFlags(r.likes, viewerId, parent.ownerUserId);
        return mapCommentToDto(
          r,
          parent.ownerUserId,
          r._count.likes,
          likeFlags.viewerHasLiked,
          likeFlags.segmentOwnerHasLiked,
          0
        );
      }),
      nextCursor: hasMore ? page[page.length - 1]!.id : null,
    };
  }

  private static async loadReplyPreviews(
    parentIds: string[],
    viewerId: string,
    ownerUserId: string,
    blockedIds: string[]
  ): Promise<Map<string, StoryCommentDto[]>> {
    const map = new Map<string, StoryCommentDto[]>();
    if (parentIds.length === 0) return map;

    const replies = await prisma.storySegmentComment.findMany({
      where: {
        parentId: { in: parentIds },
        ...(blockedIds.length > 0 ? { authorId: { notIn: blockedIds } } : {}),
      },
      include: {
        author: { select: AUTHOR_SELECT },
        _count: { select: { likes: true } },
        likes: {
          where: { userId: { in: [viewerId, ownerUserId] } },
          select: { id: true, userId: true },
        },
      },
      orderBy: [{ parentId: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }],
    });

    const grouped = new Map<string, typeof replies>();
    for (const r of replies) {
      if (!r.parentId) continue;
      const list = grouped.get(r.parentId) ?? [];
      list.push(r);
      grouped.set(r.parentId, list);
    }

    for (const [parentId, list] of grouped) {
      const preview = list.slice(0, REPLY_PREVIEW_COUNT).reverse();
      map.set(
        parentId,
        preview.map((r) => {
          const likeFlags = parseCommentLikeFlags(r.likes, viewerId, ownerUserId);
          return mapCommentToDto(
            r,
            ownerUserId,
            r._count.likes,
            likeFlags.viewerHasLiked,
            likeFlags.segmentOwnerHasLiked,
            0
          );
        })
      );
    }

    return map;
  }

  private static async getBlockedUserIds(viewerId: string): Promise<string[]> {
    const rows = await prisma.blockedUser.findMany({
      where: { OR: [{ userId: viewerId }, { blockedUserId: viewerId }] },
      select: { userId: true, blockedUserId: true },
    });
    const ids = new Set<string>();
    for (const r of rows) {
      if (r.userId === viewerId) ids.add(r.blockedUserId);
      else ids.add(r.userId);
    }
    return [...ids];
  }
}
