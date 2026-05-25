import { MessageReportReason, StorySourceType } from '@prisma/client';
import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { AuthRequest } from '../middleware/auth';
import { StoryEngagementCommentService } from '../services/storyEngagement/storyEngagement.comment.service';
import { StoryEngagementCommentLikeService } from '../services/storyEngagement/storyEngagement.commentLike.service';
import { StoryEngagementLikeService } from '../services/storyEngagement/storyEngagement.like.service';
import { StoryEngagementCaptionService } from '../services/storyEngagement/storyEngagement.caption.service';
import { StoryEngagementReportService } from '../services/storyEngagement/storyEngagement.report.service';
import { assertCanEngage } from '../services/storyEngagement/storyEngagement.permissions';
import { resolveSyntheticCaption } from '../services/storyEngagement/storyEngagement.caption';
import prisma from '../config/database';

const SOURCE_TYPES = Object.values(StorySourceType);

function parseSourceType(raw: string): StorySourceType {
  if (!SOURCE_TYPES.includes(raw as StorySourceType)) {
    throw new ApiError(400, 'Invalid sourceType');
  }
  return raw as StorySourceType;
}

function requireOwnerUserId(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new ApiError(400, 'ownerUserId is required');
  }
  return raw.trim();
}

export const getSegmentEngagement = asyncHandler(async (req: AuthRequest, res: Response) => {
  const sourceType = parseSourceType(req.params.sourceType);
  const sourceId = req.params.sourceId;
  const ownerUserId = requireOwnerUserId(req.query.ownerUserId);
  const resolved = await assertCanEngage(req.userId!, sourceType, sourceId, ownerUserId);

  const [likeCount, commentCount, viewerLike, viewerComment] = await Promise.all([
    StoryEngagementLikeService.getLikeCount(sourceType, sourceId),
    prisma.storySegmentComment.count({
      where: {
        sourceType,
        sourceId,
        deletedAt: null,
        parentId: null,
      },
    }),
    prisma.storySegmentLike.findUnique({
      where: {
        sourceType_sourceId_userId: {
          sourceType,
          sourceId,
          userId: req.userId!,
        },
      },
      select: { id: true },
    }),
    prisma.storySegmentComment.findFirst({
      where: {
        sourceType,
        sourceId,
        authorId: req.userId!,
        deletedAt: null,
      },
      select: { id: true },
    }),
  ]);

  res.json({
    success: true,
    data: {
      likeCount,
      commentCount,
      viewerHasLiked: !!viewerLike,
      viewerHasCommented: !!viewerComment,
      caption: resolveSyntheticCaption(resolved.captionContext),
    },
  });
});

export const toggleSegmentLike = asyncHandler(async (req: AuthRequest, res: Response) => {
  const sourceType = parseSourceType(req.params.sourceType);
  const sourceId = req.params.sourceId;
  const ownerUserId = requireOwnerUserId(req.query.ownerUserId);
  const result = await StoryEngagementLikeService.toggleLike(req.userId!, sourceType, sourceId, ownerUserId);
  res.json({ success: true, data: result });
});

export const listSegmentLikers = asyncHandler(async (req: AuthRequest, res: Response) => {
  const sourceType = parseSourceType(req.params.sourceType);
  const sourceId = req.params.sourceId;
  const ownerUserId = requireOwnerUserId(req.query.ownerUserId);
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : null;
  const result = await StoryEngagementLikeService.listLikers(
    req.userId!,
    sourceType,
    sourceId,
    ownerUserId,
    cursor
  );
  res.json({ success: true, data: result });
});

export const listSegmentComments = asyncHandler(async (req: AuthRequest, res: Response) => {
  const sourceType = parseSourceType(req.params.sourceType);
  const sourceId = req.params.sourceId;
  const ownerUserId = requireOwnerUserId(req.query.ownerUserId);
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : null;
  const result = await StoryEngagementCommentService.listTopLevelComments(
    req.userId!,
    sourceType,
    sourceId,
    ownerUserId,
    cursor
  );
  res.json({ success: true, data: result });
});

export const createSegmentComment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const sourceType = parseSourceType(req.params.sourceType);
  const sourceId = req.params.sourceId;
  const ownerUserId = requireOwnerUserId(req.query.ownerUserId);
  const { body, parentId, clientMutationId } = req.body;
  const result = await StoryEngagementCommentService.createComment(
    req.userId!,
    sourceType,
    sourceId,
    ownerUserId,
    { body, parentId, clientMutationId }
  );
  res.status(201).json({ success: true, data: result });
});

export const listCommentReplies = asyncHandler(async (req: AuthRequest, res: Response) => {
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : null;
  const result = await StoryEngagementCommentService.listReplies(req.userId!, req.params.id, cursor);
  res.json({ success: true, data: result });
});

export const deleteComment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await StoryEngagementCommentService.deleteComment(req.userId!, req.params.id);
  res.json({ success: true, data: result });
});

export const toggleCommentLike = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await StoryEngagementCommentLikeService.toggleLike(req.userId!, req.params.id);
  res.json({ success: true, data: result });
});

export const reportComment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const reason = (req.body.reason as MessageReportReason) || MessageReportReason.OTHER;
  const report = await StoryEngagementReportService.reportComment(
    req.userId!,
    req.params.id,
    reason,
    req.body.description
  );
  res.status(201).json({ success: true, data: report });
});

export const patchStoryItemCaption = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await StoryEngagementCaptionService.updateItemCaption(
    req.userId!,
    req.params.id,
    req.body.caption
  );
  res.json({ success: true, data: result });
});
