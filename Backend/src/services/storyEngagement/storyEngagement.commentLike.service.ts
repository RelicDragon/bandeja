import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { STORY_ENGAGEMENT_ERROR } from './storyEngagement.constants';
import { emitStoryCommentLike } from './storyEngagement.events';
import { assertCanEngage } from './storyEngagement.permissions';
import { assertLikeToggleRateLimit } from './storyEngagement.rateLimit';

export type CommentLikeToggleResult = {
  liked: boolean;
  likeCount: number;
  segmentOwnerHasLiked: boolean;
};

export class StoryEngagementCommentLikeService {
  static async toggleLike(viewerId: string, commentId: string): Promise<CommentLikeToggleResult> {
    assertLikeToggleRateLimit(viewerId);

    const comment = await prisma.storySegmentComment.findUnique({ where: { id: commentId } });
    if (!comment || comment.deletedAt) {
      throw new ApiError(404, 'Comment not found', true, { code: STORY_ENGAGEMENT_ERROR.COMMENT_NOT_FOUND });
    }

    await assertCanEngage(viewerId, comment.sourceType, comment.sourceId, comment.ownerUserId);

    const existing = await prisma.storyCommentLike.findUnique({
      where: { commentId_userId: { commentId, userId: viewerId } },
    });

    if (existing) {
      await prisma.storyCommentLike.delete({ where: { id: existing.id } });
    } else {
      await prisma.storyCommentLike.create({ data: { commentId, userId: viewerId } });
    }

    const likeCount = await prisma.storyCommentLike.count({ where: { commentId } });
    const segmentOwnerHasLiked =
      viewerId === comment.ownerUserId
        ? !existing
        : (await prisma.storyCommentLike.findUnique({
            where: {
              commentId_userId: { commentId, userId: comment.ownerUserId },
            },
          })) != null;
    emitStoryCommentLike({ commentId, likeCount, segmentOwnerHasLiked });

    return { liked: !existing, likeCount, segmentOwnerHasLiked };
  }
}
