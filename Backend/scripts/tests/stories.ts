#!/usr/bin/env ts-node
/**
 * Stories: manual CRUD, feed visibility, dedup, views, expiry, sockets.
 * Run: DB_URL=... npx ts-node -r dotenv/config scripts/tests/stories.ts
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
import { StoryDeleteService } from '../../src/services/story/story.delete.service';
import { StoryFeedService } from '../../src/services/story/story.feed.service';
import { StoryViewService } from '../../src/services/story/story.view.service';
import { expireStories } from '../../src/services/story/story.expire.service';
import { pruneInvalidStoryItems } from '../../src/services/story/story.prune.service';
import { isStoryItemMediaInvalid } from '../../src/services/story/story.validate.service';
import { ApiError } from '../../src/utils/ApiError';

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

async function main() {
  dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });
  process.env.STORY_SKIP_S3_MEDIA_CHECK = '1';

  if (!ensureDbUrl()) {
    console.log('stories: skipped (set DB_URL)');
    process.exit(0);
  }

  const suffix = `${Date.now()}`;
  const createdUserIds: string[] = [];

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
    [0, 1, 2, 3].map(async (i) => {
      const created = await prisma.user.create({
        data: {
          firstName: `StoryQA${i}`,
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
  const [viewerId, followedId, unfollowedId, photoUploaderId] = users.map((u) => u.id);

  const storyIds: string[] = [];
  const gameIds: string[] = [];

  await prisma.userFavoriteUser.upsert({
    where: { userId_favoriteUserId: { userId: viewerId, favoriteUserId: followedId } },
    create: { userId: viewerId, favoriteUserId: followedId },
    update: {},
  });

  const testUserIds = [viewerId, followedId, unfollowedId, photoUploaderId];
  await prisma.userStoryItem.deleteMany({
    where: { story: { userId: { in: testUserIds } } },
  });
  await prisma.userStory.deleteMany({
    where: { userId: { in: testUserIds } },
  });

  try {
    try {
      await StoryCreateService.createItem(followedId, {
        mediaUrl: 'https://evil.example.com/uploads/stories/originals/bad.jpg',
        thumbnailUrl: `/uploads/stories/thumbnails/qa-${suffix}.jpg`,
        messageType: MessageType.IMAGE,
      });
      assert(false, 'invalid mediaUrl must be rejected');
    } catch (e) {
      assert(e instanceof ApiError && e.statusCode === 400, 'invalid mediaUrl returns 400');
    }
    console.log('ok: reject invalid mediaUrl');

    const clientUploadId = `qa-story-${suffix}`;
    const seg1 = await StoryCreateService.createItem(followedId, {
      mediaUrl: `/uploads/stories/originals/qa-${suffix}.jpg`,
      thumbnailUrl: `/uploads/stories/thumbnails/qa-${suffix}.jpg`,
      messageType: MessageType.IMAGE,
      clientUploadId,
    });
    assert(seg1.sourceType === 'USER_STORY_ITEM', 'manual segment type');
    const itemId = seg1.key.split(':')[1];

    const seg2 = await StoryCreateService.createItem(followedId, {
      mediaUrl: `/uploads/stories/originals/qa-${suffix}.jpg`,
      thumbnailUrl: `/uploads/stories/thumbnails/qa-${suffix}.jpg`,
      messageType: MessageType.IMAGE,
      clientUploadId,
    });
    assert(seg1.key === seg2.key, 'clientUploadId idempotency');
    console.log('ok: create manual + idempotency');

    const feedFollowed = await StoryFeedService.getFeed(viewerId);
    const followedBubble = feedFollowed.bubbles.find((b) => b.user.id === followedId);
    assert(!!followedBubble, 'followed user bubble visible');
    assert(
      followedBubble!.segments.some((s) => s.sourceType === 'USER_STORY_ITEM'),
      'manual segment in feed'
    );
    console.log('ok: feed shows followed manual story');

    await StoryDeleteService.deleteItem(followedId, itemId);
    const feedAfterDelete = await StoryFeedService.getFeed(viewerId);
    const bubbleAfter = feedAfterDelete.bubbles.find((b) => b.user.id === followedId);
    assert(
      !bubbleAfter?.segments.some((s) => s.key === seg1.key),
      'deleted segment removed from feed'
    );
    console.log('ok: delete manual item');

    const selfSeg = await StoryCreateService.createItem(viewerId, {
      mediaUrl: `/uploads/stories/originals/self-${suffix}.jpg`,
      thumbnailUrl: `/uploads/stories/thumbnails/self-${suffix}.jpg`,
      messageType: MessageType.IMAGE,
    });
    storyIds.push(selfSeg.key.split(':')[1]);

    const selfFeed = await StoryFeedService.getFeed(viewerId);
    const selfBubble = selfFeed.bubbles.find((b) => b.isSelf);
    assert(!!selfBubble, 'self bubble exists');
    assert(
      selfBubble!.segments.every((s) => s.sourceType === 'USER_STORY_ITEM'),
      'self bubble manual only'
    );
    console.log('ok: self bubble manual only');

    await StoryCreateService.createItem(unfollowedId, {
      mediaUrl: `/uploads/stories/originals/unfollow-${suffix}.jpg`,
      thumbnailUrl: `/uploads/stories/thumbnails/unfollow-${suffix}.jpg`,
      messageType: MessageType.IMAGE,
    });
    const feedUnfollow = await StoryFeedService.getFeed(viewerId);
    assert(
      !feedUnfollow.bubbles.some((b) => b.user.id === unfollowedId),
      'unfollowed manual hidden'
    );
    console.log('ok: unfollowed manual hidden');

    const start = new Date(Date.now() + 86_400_000);
    const end = new Date(start.getTime() + 3_600_000);
    const privateGameId = `qa-story-priv-${suffix}`;
    const publicGameId = `qa-story-pub-${suffix}`;
    gameIds.push(privateGameId, publicGameId);

    await prisma.game.create({
      data: {
        id: privateGameId,
        entityType: EntityType.GAME,
        gameType: 'CLASSIC',
        cityId: city.id,
        startTime: start,
        endTime: end,
        timeIsSet: true,
        status: GameStatus.FINISHED,
        isPublic: false,
        resultsStatus: ResultsStatus.FINAL,
        finishedDate: new Date(),
        maxParticipants: 4,
        minParticipants: 2,
        participants: {
          create: [
            { userId: photoUploaderId, role: ParticipantRole.OWNER, status: 'PLAYING' },
          ],
        },
      },
    });

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
            { userId: photoUploaderId, role: ParticipantRole.OWNER, status: 'PLAYING' },
          ],
        },
        outcomes: {
          create: {
            userId: photoUploaderId,
            levelBefore: 3,
            levelAfter: 3.1,
            levelChange: 0.1,
            reliabilityBefore: 0,
            reliabilityAfter: 0,
            reliabilityChange: 0,
            isWinner: true,
          },
        },
      },
    });

    await prisma.userFavoriteUser.upsert({
      where: { userId_favoriteUserId: { userId: viewerId, favoriteUserId: photoUploaderId } },
      create: { userId: viewerId, favoriteUserId: photoUploaderId },
      update: {},
    });

    const privatePhoto = await prisma.gamePhoto.create({
      data: {
        gameId: privateGameId,
        uploaderId: photoUploaderId,
        originalUrl: `/uploads/chat/originals/priv-${suffix}.jpg`,
        thumbnailUrl: `/uploads/chat/thumbnails/priv-${suffix}.jpg`,
      },
    });

    const publicPhoto = await prisma.gamePhoto.create({
      data: {
        gameId: publicGameId,
        uploaderId: photoUploaderId,
        originalUrl: `/uploads/chat/originals/pub-${suffix}.jpg`,
        thumbnailUrl: `/uploads/chat/thumbnails/pub-${suffix}.jpg`,
      },
    });

    await prisma.game.update({
      where: { id: publicGameId },
      data: { photosCount: 1, mainPhotoId: publicPhoto.id },
    });

    let photoFeed = await StoryFeedService.getFeed(viewerId);
    let uploaderBubble = photoFeed.bubbles.find((b) => b.user.id === photoUploaderId);
    assert(!!uploaderBubble, 'uploader bubble with public photo');
    assert(
      !uploaderBubble!.segments.some((s) => s.key === `${StorySourceType.GAME_PHOTO}:${privatePhoto.id}`),
      'private game photo hidden'
    );
    assert(
      uploaderBubble!.segments.some((s) => s.key === `${StorySourceType.GAME_PHOTO}:${publicPhoto.id}`),
      'public game photo visible'
    );
    console.log('ok: photo visibility (public vs private)');

    await prisma.user.update({
      where: { id: photoUploaderId },
      data: { shareGamePhotosToFollowers: false },
    });
    photoFeed = await StoryFeedService.getFeed(viewerId);
    uploaderBubble = photoFeed.bubbles.find((b) => b.user.id === photoUploaderId);
    assert(
      !uploaderBubble?.segments.some((s) => s.sourceType === 'GAME_PHOTO'),
      'photo hidden when shareGamePhotosToFollowers off'
    );
    await prisma.user.update({
      where: { id: photoUploaderId },
      data: { shareGamePhotosToFollowers: true },
    });
    console.log('ok: shareGamePhotosToFollowers opt-out');

    photoFeed = await StoryFeedService.getFeed(viewerId);
    uploaderBubble = photoFeed.bubbles.find((b) => b.user.id === photoUploaderId);
    const pubPhotoSeg = uploaderBubble?.segments.find(
      (s) => s.sourceType === 'GAME_PHOTO' && s.key === `${StorySourceType.GAME_PHOTO}:${publicPhoto.id}`
    );
    assert(!!pubPhotoSeg, 'photo segment present after re-enable share flag');
    const pubResultSeg = uploaderBubble?.segments.find(
      (s) =>
        s.sourceType === 'GAME_RESULT' &&
        'game' in s &&
        s.game.id === publicGameId
    );
    assert(!pubResultSeg, 'dedup: photo wins over result for same game');
    console.log('ok: dedup photo > result');

    const viewItem = await StoryCreateService.createItem(followedId, {
      mediaUrl: `/uploads/stories/originals/view-${suffix}.jpg`,
      thumbnailUrl: `/uploads/stories/thumbnails/view-${suffix}.jpg`,
      messageType: MessageType.IMAGE,
    });
    const viewItemId = viewItem.key.split(':')[1];
    storyIds.push(viewItemId);

    await StoryViewService.markViewed(viewerId, [
      {
        sourceType: StorySourceType.USER_STORY_ITEM,
        sourceId: viewItemId,
        ownerUserId: followedId,
      },
    ]);
    await StoryViewService.markViewed(viewerId, [
      {
        sourceType: StorySourceType.USER_STORY_ITEM,
        sourceId: viewItemId,
        ownerUserId: followedId,
      },
    ]);
    const viewCount = await prisma.storyView.count({
      where: {
        viewerId,
        sourceType: StorySourceType.USER_STORY_ITEM,
        sourceId: viewItemId,
      },
    });
    assert(viewCount === 1, 'view tracking unique');
    console.log('ok: view tracking unique');

    const expiredStory = await prisma.userStory.create({
      data: {
        userId: followedId,
        expiresAt: new Date(Date.now() - 60_000),
        items: {
          create: {
            mediaUrl: `/uploads/stories/originals/exp-${suffix}.jpg`,
            thumbnailUrl: `/uploads/stories/thumbnails/exp-${suffix}.jpg`,
            messageType: MessageType.IMAGE,
          },
        },
      },
    });
    storyIds.push(expiredStory.id);

    const expiredCount = await expireStories();
    assert(expiredCount >= 1, 'expiry cron removes expired stories');
    const expiredLeft = await prisma.userStory.findUnique({ where: { id: expiredStory.id } });
    assert(expiredLeft === null, 'expired story deleted');
    console.log('ok: expiry cron');

    const pruneStory = await prisma.userStory.create({
      data: {
        userId: followedId,
        expiresAt: new Date(Date.now() + 86_400_000),
        items: {
          create: {
            mediaUrl: `https://evil.example.com/uploads/stories/originals/prune-${suffix}.jpg`,
            thumbnailUrl: `/uploads/stories/thumbnails/prune-${suffix}.jpg`,
            messageType: MessageType.IMAGE,
          },
        },
      },
      include: { items: true },
    });
    const pruneItemId = pruneStory.items[0]!.id;
    const pruneItem = pruneStory.items[0]!;
    assert(
      isStoryItemMediaInvalid({
        mediaUrl: pruneItem.mediaUrl,
        thumbnailUrl: pruneItem.thumbnailUrl,
        posterUrl: pruneItem.posterUrl,
      }),
      'prune fixture must be invalid'
    );
    const pruned = await pruneInvalidStoryItems({ ownerUserId: followedId });
    assert(pruned.itemsPruned >= 1, 'prune removes invalid story item');
    const prunedStory = await prisma.userStory.findUnique({ where: { id: pruneStory.id } });
    assert(prunedStory === null, 'empty story container removed after prune');
    const prunedItem = await prisma.userStoryItem.findUnique({ where: { id: pruneItemId } });
    assert(prunedItem === null, 'invalid item removed (cascade after last item pruned)');
    console.log('ok: prune invalid items');

    const emitted: string[] = [];
    (global as { socketService?: { io?: { to: (room: string) => { emit: (e: string) => void } } } }).socketService = {
      io: {
        to: (room: string) => ({
          emit: (event: string) => {
            emitted.push(`${room}:${event}`);
          },
        }),
      },
    };

    await StoryCreateService.createItem(followedId, {
      mediaUrl: `/uploads/stories/originals/socket-${suffix}.jpg`,
      thumbnailUrl: `/uploads/stories/thumbnails/socket-${suffix}.jpg`,
      messageType: MessageType.IMAGE,
    });
    assert(emitted.some((e) => e.includes('story:new')), 'socket story:new emitted');
    console.log('ok: socket smoke');

    await prisma.game.update({
      where: { id: publicGameId },
      data: { status: GameStatus.ARCHIVED },
    });
    const archivedFeed = await StoryFeedService.getFeed(viewerId);
    const archivedBubble = archivedFeed.bubbles.find((b) => b.user.id === photoUploaderId);
    assert(
      !!archivedBubble?.segments.some((s) => s.key === `${StorySourceType.GAME_PHOTO}:${publicPhoto.id}`),
      'ARCHIVED game photo visible in stories'
    );
    console.log('ok: ARCHIVED game photo in feed');

    await prisma.game.update({
      where: { id: publicGameId },
      data: { status: GameStatus.FINISHED },
    });

    const announcedStart = new Date(Date.now() + 172_800_000);
    const announcedEnd = new Date(announcedStart.getTime() + 3_600_000);
    const announcedGameId = `qa-story-ann-${suffix}`;
    gameIds.push(announcedGameId);
    await prisma.game.create({
      data: {
        id: announcedGameId,
        entityType: EntityType.GAME,
        gameType: 'CLASSIC',
        cityId: city.id,
        startTime: announcedStart,
        endTime: announcedEnd,
        timeIsSet: true,
        status: GameStatus.ANNOUNCED,
        isPublic: true,
        maxParticipants: 4,
        minParticipants: 2,
        participants: {
          create: [
            { userId: photoUploaderId, role: ParticipantRole.OWNER, status: 'PLAYING' },
          ],
        },
      },
    });

    let announcedFeed = await StoryFeedService.getFeed(viewerId);
    let annBubble = announcedFeed.bubbles.find((b) => b.user.id === photoUploaderId);
    assert(
      !!annBubble?.segments.some(
        (s) => s.sourceType === 'GAME_CREATED' && 'game' in s && s.game.id === announcedGameId
      ),
      'GAME_CREATED segment in feed'
    );
    await prisma.user.update({
      where: { id: photoUploaderId },
      data: { shareGameCreationsToFollowers: false },
    });
    announcedFeed = await StoryFeedService.getFeed(viewerId);
    annBubble = announcedFeed.bubbles.find((b) => b.user.id === photoUploaderId);
    assert(
      !annBubble?.segments.some(
        (s) => s.sourceType === 'GAME_CREATED' && 'game' in s && s.game.id === announcedGameId
      ),
      'GAME_CREATED hidden when shareGameCreationsToFollowers off'
    );
    await prisma.user.update({
      where: { id: photoUploaderId },
      data: { shareGameCreationsToFollowers: true },
    });
    console.log('ok: GAME_CREATED visibility + opt-out');

    const deleteSeg = await StoryCreateService.createItem(followedId, {
      mediaUrl: `/uploads/stories/originals/del-${suffix}.jpg`,
      thumbnailUrl: `/uploads/stories/thumbnails/del-${suffix}.jpg`,
      messageType: MessageType.IMAGE,
    });
    const deleteItemId = deleteSeg.key.split(':')[1];
    emitted.length = 0;
    await StoryDeleteService.deleteItem(followedId, deleteItemId);
    assert(emitted.some((e) => e.includes('story:deleted')), 'socket story:deleted emitted');
    console.log('ok: socket story:deleted smoke');

    console.log('\nstories: all checks passed');
  } finally {
    await prisma.storyView.deleteMany({
      where: { viewerId },
    });
    await prisma.userStoryItem.deleteMany({
      where: { story: { userId: { in: [viewerId, followedId, unfollowedId, photoUploaderId] } } },
    });
    await prisma.userStory.deleteMany({
      where: { userId: { in: [viewerId, followedId, unfollowedId, photoUploaderId] } },
    });
    if (gameIds.length) {
      await prisma.gameOutcome.deleteMany({ where: { gameId: { in: gameIds } } });
      await prisma.gamePhoto.deleteMany({ where: { gameId: { in: gameIds } } });
      await prisma.gameParticipant.deleteMany({ where: { gameId: { in: gameIds } } });
      await prisma.game.deleteMany({ where: { id: { in: gameIds } } });
    }
    if (createdUserIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    delete (global as { socketService?: unknown }).socketService;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
