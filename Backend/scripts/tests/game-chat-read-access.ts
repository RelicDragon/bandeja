#!/usr/bin/env ts-node
/**
 * Game chat read access: missed + pinned messages respect chatType rules.
 * Run: DB_URL=... npx ts-node -r dotenv/config scripts/tests/game-chat-read-access.ts
 */

import * as path from 'path';
import * as dotenv from 'dotenv';
import { ChatType, EntityType, GameStatus, ParticipantRole } from '@prisma/client';
import { ApiError } from '../../src/utils/ApiError';
import { MessageService } from '../../src/services/chat/message.service';
import { PinnedMessageService } from '../../src/services/chat/pinnedMessage.service';

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

async function seedGameMessage(
  prisma: typeof import('../../src/config/database').default,
  gameId: string,
  senderId: string,
  chatType: ChatType,
  content: string
) {
  return prisma.chatMessage.create({
    data: {
      chatContextType: 'GAME',
      contextId: gameId,
      senderId,
      content,
      chatType,
    },
  });
}

async function main() {
  dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

  if (!ensureDbUrl()) {
    console.log('game-chat-read-access: skipped (set DB_URL)');
    process.exit(0);
  }

  const { default: prisma } = await import('../../src/config/database');
  const city = await prisma.city.findFirst({ select: { id: true } });
  if (!city) throw new Error('no City row');

  const users = await prisma.user.findMany({
    where: { isAdmin: false },
    take: 5,
    select: { id: true },
  });
  if (users.length < 5) throw new Error('need at least 5 non-admin users');

  const [ownerId, playingId, inQueueId, parentAdminId, childPlayerId] = users.map((u) => u.id);
  const suffix = `${Date.now()}`;
  const gameId = `qa-gcra-${suffix}`;
  const parentGameId = `qa-gcra-parent-${suffix}`;
  const childGameId = `qa-gcra-child-${suffix}`;

  const start = new Date(Date.now() + 86_400_000);
  const end = new Date(start.getTime() + 3_600_000);
  const gameIds = [gameId, parentGameId, childGameId];

  await prisma.game.create({
    data: {
      id: gameId,
      entityType: EntityType.GAME,
      gameType: 'CLASSIC',
      cityId: city.id,
      startTime: start,
      endTime: end,
      timeIsSet: true,
      status: GameStatus.ANNOUNCED,
      maxParticipants: 4,
      minParticipants: 2,
      participants: {
        create: [
          { userId: ownerId, role: ParticipantRole.OWNER, status: 'NON_PLAYING' },
          { userId: playingId, role: ParticipantRole.PARTICIPANT, status: 'PLAYING' },
          { userId: inQueueId, role: ParticipantRole.PARTICIPANT, status: 'IN_QUEUE' },
        ],
      },
    },
  });

  await prisma.game.create({
    data: {
      id: parentGameId,
      entityType: EntityType.LEAGUE,
      gameType: 'CLASSIC',
      cityId: city.id,
      startTime: start,
      endTime: end,
      timeIsSet: true,
      status: GameStatus.ANNOUNCED,
      participants: {
        create: [{ userId: parentAdminId, role: ParticipantRole.OWNER, status: 'NON_PLAYING' }],
      },
    },
  });

  await prisma.game.create({
    data: {
      id: childGameId,
      entityType: EntityType.LEAGUE,
      gameType: 'CLASSIC',
      cityId: city.id,
      parentId: parentGameId,
      startTime: start,
      endTime: end,
      timeIsSet: true,
      status: GameStatus.ANNOUNCED,
      participants: {
        create: [{ userId: childPlayerId, role: ParticipantRole.PARTICIPANT, status: 'PLAYING' }],
      },
    },
  });

  const adminsMsg = await seedGameMessage(prisma, gameId, ownerId, ChatType.ADMINS, 'admin secret');
  const privateMsg = await seedGameMessage(prisma, gameId, ownerId, ChatType.PRIVATE, 'private note');
  const childAdminsMsg = await seedGameMessage(
    prisma,
    childGameId,
    childPlayerId,
    ChatType.ADMINS,
    'child admin secret'
  );

  await prisma.pinnedMessage.createMany({
    data: [
      {
        chatContextType: 'GAME',
        contextId: gameId,
        chatType: ChatType.ADMINS,
        messageId: adminsMsg.id,
        order: 0,
        pinnedById: ownerId,
      },
      {
        chatContextType: 'GAME',
        contextId: gameId,
        chatType: ChatType.PRIVATE,
        messageId: privateMsg.id,
        order: 0,
        pinnedById: ownerId,
      },
      {
        chatContextType: 'GAME',
        contextId: childGameId,
        chatType: ChatType.ADMINS,
        messageId: childAdminsMsg.id,
        order: 0,
        pinnedById: childPlayerId,
      },
    ],
  });

  try {
    await expectApiError(
      MessageService.getMissedMessages('GAME', gameId, playingId, undefined, ChatType.ADMINS),
      403,
      'playing participant blocked from ADMINS missed messages'
    );
    await expectApiError(
      PinnedMessageService.getPinnedMessages('GAME', gameId, ChatType.ADMINS, playingId),
      403,
      'playing participant blocked from ADMINS pinned messages'
    );

    const privateMissed = await MessageService.getMissedMessages(
      'GAME',
      gameId,
      playingId,
      undefined,
      ChatType.PRIVATE
    );
    assert(
      privateMissed.messages.some((m) => m.id === privateMsg.id),
      'playing participant can fetch PRIVATE missed messages'
    );
    console.log('ok: playing participant can fetch PRIVATE missed messages');

    const privatePinned = await PinnedMessageService.getPinnedMessages(
      'GAME',
      gameId,
      ChatType.PRIVATE,
      playingId
    );
    assert(
      privatePinned.some((m) => m.id === privateMsg.id),
      'playing participant can fetch PRIVATE pinned messages'
    );
    console.log('ok: playing participant can fetch PRIVATE pinned messages');

    await expectApiError(
      MessageService.getMissedMessages('GAME', gameId, inQueueId, undefined, ChatType.PRIVATE),
      403,
      'in-queue participant blocked from PRIVATE missed messages'
    );
    await expectApiError(
      PinnedMessageService.getPinnedMessages('GAME', gameId, ChatType.PRIVATE, inQueueId),
      403,
      'in-queue participant blocked from PRIVATE pinned messages'
    );

    const ownerAdminsMissed = await MessageService.getMissedMessages(
      'GAME',
      gameId,
      ownerId,
      undefined,
      ChatType.ADMINS
    );
    assert(
      ownerAdminsMissed.messages.some((m) => m.id === adminsMsg.id),
      'owner can fetch ADMINS missed messages'
    );
    console.log('ok: owner can fetch ADMINS missed messages');

    const ownerAdminsPinned = await PinnedMessageService.getPinnedMessages(
      'GAME',
      gameId,
      ChatType.ADMINS,
      ownerId
    );
    assert(
      ownerAdminsPinned.some((m) => m.id === adminsMsg.id),
      'owner can fetch ADMINS pinned messages'
    );
    console.log('ok: owner can fetch ADMINS pinned messages');

    const parentAdminsMissed = await MessageService.getMissedMessages(
      'GAME',
      childGameId,
      parentAdminId,
      undefined,
      ChatType.ADMINS
    );
    assert(
      parentAdminsMissed.messages.some((m) => m.id === childAdminsMsg.id),
      'parent-game owner can fetch child ADMINS missed messages'
    );
    console.log('ok: parent-game owner can fetch child ADMINS missed messages');

    const parentAdminsPinned = await PinnedMessageService.getPinnedMessages(
      'GAME',
      childGameId,
      ChatType.ADMINS,
      parentAdminId
    );
    assert(
      parentAdminsPinned.some((m) => m.id === childAdminsMsg.id),
      'parent-game owner can fetch child ADMINS pinned messages'
    );
    console.log('ok: parent-game owner can fetch child ADMINS pinned messages');
  } finally {
    for (const id of gameIds) {
      await prisma.pinnedMessage.deleteMany({ where: { contextId: id } });
      await prisma.chatMessage.deleteMany({ where: { contextId: id } });
      await prisma.gameParticipant.deleteMany({ where: { gameId: id } });
      await prisma.game.deleteMany({ where: { id } });
    }
  }

  console.log('ok: game-chat-read-access');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
