#!/usr/bin/env ts-node
/**
 * Story DM reply: create user chat message with storyReply JSON.
 * Run: DB_URL=... npx ts-node -r dotenv/config scripts/tests/story-dm-reply.ts
 */

import * as path from 'path';
import * as dotenv from 'dotenv';
import { ChatType, MessageType } from '@prisma/client';
import { ApiError } from '../../src/utils/ApiError';
import { StoryCreateService } from '../../src/services/story/story.create.service';
import { MessageService } from '../../src/services/chat/message.service';
import { UserChatService } from '../../src/services/chat/userChat.service';
import { formatStoryReplyPreview } from '../../src/services/chat/storyReplySanitize';

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

async function expectApiError(p: Promise<unknown>, status: number, label: string) {
  try {
    await p;
    console.error(`FAIL: ${label} — expected ApiError ${status}`);
    process.exit(1);
  } catch (e) {
    if (e instanceof ApiError && e.statusCode === status) {
      console.log(`ok: ${label}`);
      return;
    }
    throw e;
  }
}

async function main() {
  dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

  if (!ensureDbUrl()) {
    console.log('story-dm-reply: skipped (set DB_URL)');
    process.exit(0);
  }

  const suffix = `${Date.now()}`;
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

  const [sender, owner] = await Promise.all(
    [0, 1].map((i) =>
      prisma.user.create({
        data: {
          firstName: `DmQA${i}`,
          lastName: suffix,
          nameIsSet: true,
          currentCityId: city!.id,
        },
        select: { id: true },
      })
    )
  );
  const senderId = sender.id;
  const ownerId = owner.id;
  const createdMessageIds: string[] = [];

  await prisma.userFavoriteUser.create({
    data: { userId: senderId, favoriteUserId: ownerId },
  });

  try {
    const seg = await StoryCreateService.createItem(ownerId, {
      mediaUrl: `/uploads/stories/originals/dm-${suffix}.jpg`,
      thumbnailUrl: `/uploads/stories/thumbnails/dm-${suffix}.jpg`,
      messageType: MessageType.IMAGE,
    });
    const itemId = seg.key.split(':')[1]!;

    const chat = await UserChatService.getOrCreateChatWithUser(senderId, ownerId);
    assert(!!chat?.id, 'user chat created');

    const storyReply = {
      sourceType: 'USER_STORY_ITEM',
      sourceId: itemId,
      ownerUserId: ownerId,
      thumbnailUrl: `/uploads/stories/thumbnails/dm-${suffix}.jpg`,
      mediaUrl: `/uploads/stories/originals/dm-${suffix}.jpg`,
      mediaType: 'IMAGE',
    };

    const message = await MessageService.createMessageWithEvent({
      chatContextType: 'USER',
      contextId: chat.id,
      senderId,
      content: 'Nice story!',
      mediaUrls: [],
      storyReply,
      chatType: ChatType.PUBLIC,
    });
    createdMessageIds.push(message.id);

    const stored = await prisma.chatMessage.findUnique({
      where: { id: message.id },
      select: { storyReply: true, content: true },
    });
    const reply = stored?.storyReply as Record<string, string> | null;
    assert(reply?.sourceId === itemId, 'storyReply persisted');
    assert(reply?.ownerUserId === ownerId, 'storyReply owner persisted');
    assert(stored?.content === 'Nice story!', 'content persisted');
    console.log('ok: story DM with storyReply created');

    assert(
      formatStoryReplyPreview('Nice story!') === '[TYPE:STORY_REPLY]Nice story!',
      'preview format'
    );
    console.log('ok: story reply preview format');

    await expectApiError(
      MessageService.createMessageWithEvent({
        chatContextType: 'USER',
        contextId: chat.id,
        senderId,
        content: 'bad owner',
        mediaUrls: [],
        storyReply: { ...storyReply, ownerUserId: senderId },
        chatType: ChatType.PUBLIC,
      }),
      400,
      'wrong story owner rejected'
    );

    await expectApiError(
      MessageService.createMessageWithEvent({
        chatContextType: 'USER',
        contextId: chat.id,
        senderId,
        content: 'combined',
        mediaUrls: [],
        replyToId: message.id,
        storyReply,
        chatType: ChatType.PUBLIC,
      }),
      400,
      'replyTo + storyReply rejected'
    );

    console.log('\nstory-dm-reply: all checks passed');
  } finally {
    if (createdMessageIds.length) {
      await prisma.chatMessage.deleteMany({ where: { id: { in: createdMessageIds } } });
    }
    await prisma.userFavoriteUser.deleteMany({
      where: { userId: senderId, favoriteUserId: ownerId },
    });
    await prisma.user.deleteMany({ where: { id: { in: [senderId, ownerId] } } });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
