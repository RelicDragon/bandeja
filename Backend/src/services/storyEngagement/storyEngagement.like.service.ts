import { StorySourceType } from '@prisma/client';
import prisma from '../../config/database';
import { USER_SELECT_WITH_SPORT_PROFILES } from '../../utils/constants';
import type { BasicUser } from '../../types/user.types';
import { projectEmbeddedUserByPrimarySport } from '../user/projectEmbeddedBasicUsers';
import { LIKER_PAGE_SIZE } from './storyEngagement.constants';
import { emitStoryLike } from './storyEngagement.events';
import { notifyStoryLiked } from './storyEngagement.notifications';
import { assertCanEngage } from './storyEngagement.permissions';
import { assertLikeToggleRateLimit } from './storyEngagement.rateLimit';

export type SegmentLikeToggleResult = {
  liked: boolean;
  likeCount: number;
};

function toBasicUser(u: {
  id: string;
  firstName: string | null;
  lastName: string | null;
  avatar: string | null;
  level: number;
  socialLevel: number;
  gender: string;
  approvedLevel: boolean;
  isTrainer: boolean;
}): BasicUser {
  return {
    id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    avatar: u.avatar,
    level: u.level,
    socialLevel: u.socialLevel,
    gender: u.gender,
    approvedLevel: u.approvedLevel,
    isTrainer: u.isTrainer,
  };
}

export class StoryEngagementLikeService {
  static async toggleLike(
    viewerId: string,
    sourceType: StorySourceType,
    sourceId: string,
    ownerUserId: string
  ): Promise<SegmentLikeToggleResult> {
    await assertCanEngage(viewerId, sourceType, sourceId, ownerUserId);
    assertLikeToggleRateLimit(viewerId);

    const existing = await prisma.storySegmentLike.findUnique({
      where: { sourceType_sourceId_userId: { sourceType, sourceId, userId: viewerId } },
    });

    if (existing) {
      await prisma.storySegmentLike.delete({ where: { id: existing.id } });
    } else {
      await prisma.storySegmentLike.create({
        data: { sourceType, sourceId, userId: viewerId },
      });
    }

    const likeCount = await prisma.storySegmentLike.count({ where: { sourceType, sourceId } });
    const liked = !existing;

    emitStoryLike({
      sourceType,
      sourceId,
      ownerUserId,
      likeCount,
      viewerId,
      liked,
    });
    if (liked) {
      void notifyStoryLiked({ actorId: viewerId, ownerUserId, sourceType, sourceId, likeCount });
    }

    return { liked, likeCount };
  }

  static async getLikeCount(sourceType: StorySourceType, sourceId: string): Promise<number> {
    return prisma.storySegmentLike.count({ where: { sourceType, sourceId } });
  }

  static async listLikers(
    viewerId: string,
    sourceType: StorySourceType,
    sourceId: string,
    ownerUserId: string,
    cursor?: string | null
  ): Promise<{ users: BasicUser[]; nextCursor: string | null }> {
    await assertCanEngage(viewerId, sourceType, sourceId, ownerUserId);

    const cursorRow = cursor
      ? await prisma.storySegmentLike.findUnique({
          where: { id: cursor },
          select: { createdAt: true, id: true },
        })
      : null;

    const rows = await prisma.storySegmentLike.findMany({
      where: {
        sourceType,
        sourceId,
        ...(cursorRow
          ? {
              OR: [
                { createdAt: { lt: cursorRow.createdAt } },
                { createdAt: cursorRow.createdAt, id: { lt: cursorRow.id } },
              ],
            }
          : {}),
      },
      include: { user: { select: USER_SELECT_WITH_SPORT_PROFILES } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: LIKER_PAGE_SIZE + 1,
    });

    const hasMore = rows.length > LIKER_PAGE_SIZE;
    const page = hasMore ? rows.slice(0, LIKER_PAGE_SIZE) : rows;

    return {
      users: page.map((r) => toBasicUser(projectEmbeddedUserByPrimarySport(r.user))),
      nextCursor: hasMore ? page[page.length - 1]!.id : null,
    };
  }
}
