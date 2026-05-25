#!/usr/bin/env ts-node
/**
 * Story engagement: likes, comments, permissions, feed counts, expiry.
 * Run: DB_URL=... npx ts-node -r dotenv/config scripts/tests/story-engagement.ts
 */

import * as path from 'path';
import * as dotenv from 'dotenv';
import {
  EntityType,
  GameStatus,
  MessageType,
  ParticipantRole,
  ResultsStatus,
  StorySourceType,
} from '@prisma/client';
import { StoryCreateService } from '../../src/services/story/story.create.service';
import { StoryFeedService } from '../../src/services/story/story.feed.service';
import { expireStories } from '../../src/services/story/story.expire.service';
import { ApiError } from '../../src/utils/ApiError';

process.env.STORY_ENGAGEMENT_TEST_COMMENT_CAP = '3';
process.env.STORY_ENGAGEMENT_SKIP_RATE_LIMIT = '1';
process.env.STORY_SKIP_S3_MEDIA_CHECK = '1';

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function ensureDbUrl() {
  let url = process.env.DB_URL;
  if (!url) return false;
  if (!/[?&]schema=/.test(url)) {
    url += (url.includes('?') ? '&' : '?') + 'schema=padelpulse';
    process.env.DB_URL = url;
  }
  return true;
}

async function expectApiError(
  p: Promise<unknown>,
  status: number,
  code?: string,
  label?: string
) {
  try {
    await p;
    console.error(`FAIL: ${label ?? 'call'} — expected ApiError ${status}`);
    process.exit(1);
  } catch (e) {
    if (e instanceof ApiError && e.statusCode === status) {
      if (code && e.data?.code !== code) {
        console.error(`FAIL: ${label ?? 'call'} — expected code ${code}, got ${e.data?.code}`);
        process.exit(1);
      }
      console.log(`ok: ${label ?? 'expected error'}`);
      return;
    }
    throw e;
  }
}

async function main() {
  dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

  if (!ensureDbUrl()) {
    console.log('story-engagement: skipped (set DB_URL)');
    process.exit(0);
  }

  const { StoryEngagementLikeService } = await import(
    '../../src/services/storyEngagement/storyEngagement.like.service'
  );
  const { StoryEngagementCommentService } = await import(
    '../../src/services/storyEngagement/storyEngagement.comment.service'
  );

  const suffix = `${Date.now()}`;
  const createdUserIds: string[] = [];
  const gameIds: string[] = [];

  const { default: prisma } = await import('../../src/config/database');

  let city = await prisma.city.findFirst({ select: { id: true } });
  if (!city) {
    city = await prisma.city.create({
      data: {
        name: `QA City ${suffix}`,
        country: 'QA',
        timezone: 'UTC',
        isCorrect: true,
      },
      select: { id: true },
    });
  }

  const users = await Promise.all(
    [0, 1, 2, 3, 4].map(async (i) => {
      const created = await prisma.user.create({
        data: {
          firstName: `EngQA${i}`,
          lastName: suffix,
          nameIsSet: true,
          currentCityId: city.id,
        },
        select: { id: true },
      });
      createdUserIds.push(created.id);
      return created;
    })
  );
  const [followerId, ownerId, unfollowedId, photoUploaderId, gameOwnerId] = users.map((u) => u.id);

  await prisma.userFavoriteUser.upsert({
    where: { userId_favoriteUserId: { userId: followerId, favoriteUserId: ownerId } },
    create: { userId: followerId, favoriteUserId: ownerId },
    update: {},
  });
  await prisma.userFavoriteUser.upsert({
    where: { userId_favoriteUserId: { userId: followerId, favoriteUserId: photoUploaderId } },
    create: { userId: followerId, favoriteUserId: photoUploaderId },
    update: {},
  });

  try {
    const seg = await StoryCreateService.createItem(ownerId, {
      mediaUrl: `/uploads/stories/originals/eng-${suffix}.jpg`,
      thumbnailUrl: `/uploads/stories/thumbnails/eng-${suffix}.jpg`,
      messageType: MessageType.IMAGE,
    });
    const itemId = seg.key.split(':')[1]!;

    const like1 = await StoryEngagementLikeService.toggleLike(
      followerId,
      StorySourceType.USER_STORY_ITEM,
      itemId,
      ownerId
    );
    assert(like1.liked === true && like1.likeCount === 1, 'first like');

    const like2 = await StoryEngagementLikeService.toggleLike(
      followerId,
      StorySourceType.USER_STORY_ITEM,
      itemId,
      ownerId
    );
    assert(like2.liked === false && like2.likeCount === 0, 'unlike toggle');

    const like3 = await StoryEngagementLikeService.toggleLike(
      followerId,
      StorySourceType.USER_STORY_ITEM,
      itemId,
      ownerId
    );
    const like4 = await StoryEngagementLikeService.toggleLike(
      followerId,
      StorySourceType.USER_STORY_ITEM,
      itemId,
      ownerId
    );
    assert(like3.liked === true && like4.liked === false, 'like toggle idempotency');
    console.log('ok: like toggle idempotency');

    await expectApiError(
      StoryEngagementLikeService.toggleLike(
        unfollowedId,
        StorySourceType.USER_STORY_ITEM,
        itemId,
        ownerId
      ),
      403,
      'STORY_ENGAGEMENT_FORBIDDEN',
      'non-follower like rejected'
    );

    await prisma.blockedUser.create({
      data: { userId: ownerId, blockedUserId: followerId },
    });
    await expectApiError(
      StoryEngagementLikeService.toggleLike(
        followerId,
        StorySourceType.USER_STORY_ITEM,
        itemId,
        ownerId
      ),
      403,
      'STORY_ENGAGEMENT_FORBIDDEN',
      'blocked user like rejected'
    );
    await prisma.blockedUser.deleteMany({
      where: { userId: ownerId, blockedUserId: followerId },
    });

    const expiredStory = await prisma.userStory.create({
      data: {
        userId: ownerId,
        expiresAt: new Date(Date.now() - 60_000),
        items: {
          create: {
            mediaUrl: `/uploads/stories/originals/exp-eng-${suffix}.jpg`,
            thumbnailUrl: `/uploads/stories/thumbnails/exp-eng-${suffix}.jpg`,
            messageType: MessageType.IMAGE,
          },
        },
      },
      include: { items: true },
    });
    const expiredItemId = expiredStory.items[0]!.id;
    await expectApiError(
      StoryEngagementLikeService.toggleLike(
        followerId,
        StorySourceType.USER_STORY_ITEM,
        expiredItemId,
        ownerId
      ),
      404,
      'STORY_SEGMENT_NOT_FOUND',
      'expired segment rejected'
    );

    const start = new Date(Date.now() + 86_400_000);
    const end = new Date(start.getTime() + 3_600_000);
    const publicGameId = `qa-eng-pub-${suffix}`;
    gameIds.push(publicGameId);

    await prisma.game.create({
      data: {
        id: publicGameId,
        entityType: EntityType.GAME,
        gameType: 'CLASSIC',
        cityId: city.id,
        startTime: start,
        endTime: end,
        timeIsSet: true,
        status: GameStatus.FINISHED,
        isPublic: true,
        resultsStatus: ResultsStatus.FINAL,
        finishedDate: new Date(),
        maxParticipants: 4,
        minParticipants: 2,
        participants: {
          create: [
            { userId: gameOwnerId, role: ParticipantRole.OWNER, status: 'PLAYING' },
            { userId: photoUploaderId, role: ParticipantRole.PARTICIPANT, status: 'PLAYING' },
          ],
        },
      },
    });

    const publicPhoto = await prisma.gamePhoto.create({
      data: {
        gameId: publicGameId,
        uploaderId: photoUploaderId,
        originalUrl: `/uploads/chat/originals/eng-pub-${suffix}.jpg`,
        thumbnailUrl: `/uploads/chat/thumbnails/eng-pub-${suffix}.jpg`,
      },
    });
    await prisma.game.update({
      where: { id: publicGameId },
      data: { photosCount: 1, mainPhotoId: publicPhoto.id },
    });

    await StoryEngagementLikeService.toggleLike(
      followerId,
      StorySourceType.GAME_PHOTO,
      publicPhoto.id,
      photoUploaderId
    );
    await expectApiError(
      StoryEngagementLikeService.toggleLike(
        followerId,
        StorySourceType.GAME_PHOTO,
        publicPhoto.id,
        gameOwnerId
      ),
      404,
      'STORY_SEGMENT_NOT_FOUND',
      'GAME_PHOTO wrong ownerUserId rejected'
    );
    console.log('ok: GAME_PHOTO ownerUserId vs uploader');

    await prisma.user.update({
      where: { id: photoUploaderId },
      data: { shareGamePhotosToFollowers: false },
    });
    await expectApiError(
      StoryEngagementLikeService.toggleLike(
        followerId,
        StorySourceType.GAME_PHOTO,
        publicPhoto.id,
        photoUploaderId
      ),
      404,
      'STORY_SEGMENT_NOT_FOUND',
      'share-flag hidden segment rejected'
    );
    await prisma.user.update({
      where: { id: photoUploaderId },
      data: { shareGamePhotosToFollowers: true },
    });

    const replySeg = await StoryCreateService.createItem(ownerId, {
      mediaUrl: `/uploads/stories/originals/reply-${suffix}.jpg`,
      thumbnailUrl: `/uploads/stories/thumbnails/reply-${suffix}.jpg`,
      messageType: MessageType.IMAGE,
    });
    const replyItemId = replySeg.key.split(':')[1]!;

    const { comment: topComment } = await StoryEngagementCommentService.createComment(
      followerId,
      StorySourceType.USER_STORY_ITEM,
      replyItemId,
      ownerId,
      { body: 'Top level comment' }
    );
    const { comment: reply } = await StoryEngagementCommentService.createComment(
      followerId,
      StorySourceType.USER_STORY_ITEM,
      replyItemId,
      ownerId,
      { body: 'Reply comment', parentId: topComment.id }
    );
    assert(reply.id !== topComment.id, 'reply created');
    await expectApiError(
      StoryEngagementCommentService.createComment(
        followerId,
        StorySourceType.USER_STORY_ITEM,
        replyItemId,
        ownerId,
        { body: 'Nested reply', parentId: reply.id }
      ),
      400,
      'STORY_COMMENT_INVALID_PARENT',
      'reply-to-reply rejected'
    );
    console.log('ok: reply depth');

    const { StoryEngagementCommentLikeService } = await import(
      '../../src/services/storyEngagement/storyEngagement.commentLike.service'
    );
    const ownerLike = await StoryEngagementCommentLikeService.toggleLike(ownerId, topComment.id);
    assert(ownerLike.segmentOwnerHasLiked === true, 'owner like sets segmentOwnerHasLiked');
    const { comments: likedComments } = await StoryEngagementCommentService.listTopLevelComments(
      followerId,
      StorySourceType.USER_STORY_ITEM,
      replyItemId,
      ownerId
    );
    const likedRow = likedComments.find((c) => c.id === topComment.id);
    assert(likedRow?.segmentOwnerHasLiked === true, 'list includes segmentOwnerHasLiked');
    await StoryEngagementCommentLikeService.toggleLike(ownerId, topComment.id);
    console.log('ok: segmentOwnerHasLiked on comment');

    const mutationId = `qa-mutation-${suffix}`;
    const { comment: c1 } = await StoryEngagementCommentService.createComment(
      followerId,
      StorySourceType.USER_STORY_ITEM,
      replyItemId,
      ownerId,
      { body: 'Idempotent comment', clientMutationId: mutationId }
    );
    const { comment: c2 } = await StoryEngagementCommentService.createComment(
      followerId,
      StorySourceType.USER_STORY_ITEM,
      replyItemId,
      ownerId,
      { body: 'Idempotent comment', clientMutationId: mutationId }
    );
    assert(c1.id === c2.id, 'clientMutationId replay returns same comment');
    console.log('ok: clientMutationId replay');

    const deleteSeg = await StoryCreateService.createItem(ownerId, {
      mediaUrl: `/uploads/stories/originals/del-${suffix}.jpg`,
      thumbnailUrl: `/uploads/stories/thumbnails/del-${suffix}.jpg`,
      messageType: MessageType.IMAGE,
    });
    const deleteItemId = deleteSeg.key.split(':')[1]!;

    const { comment: authorComment } = await StoryEngagementCommentService.createComment(
      followerId,
      StorySourceType.USER_STORY_ITEM,
      deleteItemId,
      ownerId,
      { body: 'Author-owned comment' }
    );
    await StoryEngagementCommentService.deleteComment(followerId, authorComment.id);
    const deletedByAuthor = await prisma.storySegmentComment.findUnique({
      where: { id: authorComment.id },
    });
    assert(deletedByAuthor?.deletedAt != null, 'author delete soft-deletes');

    const { comment: ownerDeleteComment } = await StoryEngagementCommentService.createComment(
      followerId,
      StorySourceType.USER_STORY_ITEM,
      deleteItemId,
      ownerId,
      { body: 'Owner will delete' }
    );
    await StoryEngagementCommentService.deleteComment(ownerId, ownerDeleteComment.id);
    const deletedByOwner = await prisma.storySegmentComment.findUnique({
      where: { id: ownerDeleteComment.id },
    });
    assert(deletedByOwner?.deletedAt != null, 'owner delete soft-deletes');
    console.log('ok: owner vs author delete');

    await StoryEngagementLikeService.toggleLike(
      followerId,
      StorySourceType.USER_STORY_ITEM,
      itemId,
      ownerId
    );
    const feed = await StoryFeedService.getFeed(followerId);
    const ownerBubble = feed.bubbles.find((b) => b.user.id === ownerId);
    const feedSeg = ownerBubble?.segments.find((s) => s.key === seg.key);
    assert(feedSeg?.engagement != null, 'feed segment has engagement');
    assert(
      typeof feedSeg!.engagement!.likeCount === 'number' &&
        typeof feedSeg!.engagement!.commentCount === 'number',
      'feed engagement counts present'
    );
    console.log('ok: feed counts batch');

    const capSeg = await StoryCreateService.createItem(ownerId, {
      mediaUrl: `/uploads/stories/originals/cap-${suffix}.jpg`,
      thumbnailUrl: `/uploads/stories/thumbnails/cap-${suffix}.jpg`,
      messageType: MessageType.IMAGE,
    });
    const capItemId = capSeg.key.split(':')[1]!;

    await StoryEngagementCommentService.createComment(
      followerId,
      StorySourceType.USER_STORY_ITEM,
      capItemId,
      ownerId,
      { body: 'Cap comment 1' }
    );
    await StoryEngagementCommentService.createComment(
      followerId,
      StorySourceType.USER_STORY_ITEM,
      capItemId,
      ownerId,
      { body: 'Cap comment 2' }
    );
    await StoryEngagementCommentService.createComment(
      followerId,
      StorySourceType.USER_STORY_ITEM,
      capItemId,
      ownerId,
      { body: 'Cap comment 3' }
    );
    await expectApiError(
      StoryEngagementCommentService.createComment(
        followerId,
        StorySourceType.USER_STORY_ITEM,
        capItemId,
        ownerId,
        { body: 'Cap comment 4 exceeds limit' }
      ),
      429,
      'STORY_COMMENT_CAP_REACHED',
      'comment cap 429'
    );

    await prisma.storySegmentLike.create({
      data: {
        sourceType: StorySourceType.USER_STORY_ITEM,
        sourceId: expiredItemId,
        userId: followerId,
      },
    });
    await prisma.storySegmentComment.create({
      data: {
        sourceType: StorySourceType.USER_STORY_ITEM,
        sourceId: expiredItemId,
        ownerUserId: ownerId,
        authorId: followerId,
        body: 'Expired segment comment',
      },
    });
    const likesBefore = await prisma.storySegmentLike.count({
      where: {
        sourceType: StorySourceType.USER_STORY_ITEM,
        sourceId: expiredItemId,
      },
    });
    assert(likesBefore >= 1, 'engagement exists on expired item before cron');

    await expireStories();
    const likesAfter = await prisma.storySegmentLike.count({
      where: {
        sourceType: StorySourceType.USER_STORY_ITEM,
        sourceId: expiredItemId,
      },
    });
    const commentsAfter = await prisma.storySegmentComment.count({
      where: {
        sourceType: StorySourceType.USER_STORY_ITEM,
        sourceId: expiredItemId,
      },
    });
    assert(likesAfter === 0 && commentsAfter === 0, 'expiry removes engagement');
    console.log('ok: expiry removes engagement');

    console.log('\nstory-engagement: all checks passed');
  } finally {
    await prisma.storyCommentLike.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.storySegmentComment.deleteMany({
      where: { authorId: { in: createdUserIds } },
    });
    await prisma.storySegmentLike.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.storyView.deleteMany({ where: { viewerId: followerId } });
    await prisma.blockedUser.deleteMany({
      where: {
        OR: [
          { userId: { in: createdUserIds } },
          { blockedUserId: { in: createdUserIds } },
        ],
      },
    });
    await prisma.userStoryItem.deleteMany({
      where: { story: { userId: { in: createdUserIds } } },
    });
    await prisma.userStory.deleteMany({ where: { userId: { in: createdUserIds } } });
    if (gameIds.length) {
      await prisma.gamePhoto.deleteMany({ where: { gameId: { in: gameIds } } });
      await prisma.gameParticipant.deleteMany({ where: { gameId: { in: gameIds } } });
      await prisma.game.deleteMany({ where: { id: { in: gameIds } } });
    }
    if (createdUserIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
