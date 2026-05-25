import { StorySourceType } from '@prisma/client';
import prisma from '../../config/database';
import { segmentEngagementKey } from './storyEngagement.constants';

export type SegmentEngagementCounts = {
  likeCount: number;
  commentCount: number;
  viewerHasLiked: boolean;
};

export type SegmentEngagementDto = SegmentEngagementCounts & {
  caption: string | null;
};

export type SegmentKeyInput = {
  sourceType: StorySourceType;
  sourceId: string;
};

export async function batchSegmentEngagementCounts(
  viewerId: string,
  segments: SegmentKeyInput[],
): Promise<Map<string, SegmentEngagementCounts>> {
  const result = new Map<string, SegmentEngagementCounts>();
  if (segments.length === 0) return result;

  const uniqueKeys = new Map<string, SegmentKeyInput>();
  for (const seg of segments) {
    uniqueKeys.set(segmentEngagementKey(seg.sourceType, seg.sourceId), seg);
  }
  const refs = [...uniqueKeys.values()];

  const orFilter = refs.map((s) => ({
    sourceType: s.sourceType,
    sourceId: s.sourceId,
  }));

  const [likeGroups, commentGroups, viewerLikes] = await Promise.all([
    prisma.storySegmentLike.groupBy({
      by: ['sourceType', 'sourceId'],
      where: { OR: orFilter },
      _count: { _all: true },
    }),
    prisma.storySegmentComment.groupBy({
      by: ['sourceType', 'sourceId'],
      where: { OR: orFilter, deletedAt: null, parentId: null },
      _count: { _all: true },
    }),
    prisma.storySegmentLike.findMany({
      where: {
        userId: viewerId,
        OR: orFilter,
      },
      select: { sourceType: true, sourceId: true },
    }),
  ]);

  const likeCountByKey = new Map<string, number>();
  for (const row of likeGroups) {
    likeCountByKey.set(
      segmentEngagementKey(row.sourceType, row.sourceId),
      row._count._all,
    );
  }

  const commentCountByKey = new Map<string, number>();
  for (const row of commentGroups) {
    commentCountByKey.set(
      segmentEngagementKey(row.sourceType, row.sourceId),
      row._count._all,
    );
  }

  const viewerLikedKeys = new Set(
    viewerLikes.map((l) => segmentEngagementKey(l.sourceType, l.sourceId)),
  );

  for (const [key] of uniqueKeys) {
    result.set(key, {
      likeCount: likeCountByKey.get(key) ?? 0,
      commentCount: commentCountByKey.get(key) ?? 0,
      viewerHasLiked: viewerLikedKeys.has(key),
    });
  }

  return result;
}

export const batchLoadEngagementCounts = batchSegmentEngagementCounts;

export async function deleteEngagementForManualItem(itemId: string): Promise<void> {
  const sourceType = StorySourceType.USER_STORY_ITEM;
  await prisma.$transaction([
    prisma.storySegmentLike.deleteMany({ where: { sourceType, sourceId: itemId } }),
    prisma.storySegmentComment.deleteMany({ where: { sourceType, sourceId: itemId } }),
  ]);
}
