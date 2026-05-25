import { MessageReportReason } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { STORY_ENGAGEMENT_ERROR } from './storyEngagement.constants';
import { assertCanEngage } from './storyEngagement.permissions';

export class StoryEngagementReportService {
  static async reportComment(
    viewerId: string,
    commentId: string,
    reason: MessageReportReason = MessageReportReason.OTHER,
    description?: string
  ) {
    const comment = await prisma.storySegmentComment.findUnique({ where: { id: commentId } });
    if (!comment || comment.deletedAt) {
      throw new ApiError(404, 'Comment not found', true, { code: STORY_ENGAGEMENT_ERROR.COMMENT_NOT_FOUND });
    }

    await assertCanEngage(viewerId, comment.sourceType, comment.sourceId, comment.ownerUserId);

    const existing = await prisma.storyCommentReport.findUnique({
      where: { commentId_reporterId: { commentId, reporterId: viewerId } },
    });
    if (existing) {
      throw new ApiError(400, 'You have already reported this comment');
    }

    return prisma.storyCommentReport.create({
      data: {
        commentId,
        reporterId: viewerId,
        reason,
        description: description?.trim() || null,
        status: 'PENDING',
      },
    });
  }
}
