#!/usr/bin/env ts-node
/**
 * Game chat viewer access: active + archived lifecycle read/write guards.
 * Run: DB_URL=... npx ts-node -r dotenv/config scripts/tests/game-chat-viewer-access.ts
 */

import * as path from 'path';
import * as dotenv from 'dotenv';
import { ChatType, EntityType, GameStatus, ParticipantRole } from '@prisma/client';
import { ApiError } from '../../src/utils/ApiError';
import { GameChatViewerAccessService } from '../../src/services/chat/gameChatViewerAccess.service';
import { MessageService } from '../../src/services/chat/message.service';

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
  label: string,
  code?: string
) {
  try {
    await p;
    console.error(`FAIL: ${label} — expected ApiError ${status}`);
    process.exit(1);
  } catch (e) {
    if (e instanceof ApiError && e.statusCode === status) {
      if (code != null && e.data?.code !== code) {
        console.error(`FAIL: ${label} — expected code ${code}, got ${String(e.data?.code)}`);
        process.exit(1);
      }
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

async function seedCancelledGame(
  prisma: typeof import('../../src/config/database').default,
  params: {
    id: string;
    cityId: string;
    cancelledByUserId: string;
    startTime: Date;
    parentId?: string;
    participants: Array<{ userId: string; role: ParticipantRole; status: string }>;
  }
) {
  await prisma.cancelledGame.create({
    data: {
      id: params.id,
      entityType: EntityType.GAME,
      sport: 'PADEL',
      cancelledByUserId: params.cancelledByUserId,
      cityId: params.cityId,
      startTime: params.startTime,
      parentId: params.parentId,
      participants: {
        create: params.participants.map((p) => ({
          userId: p.userId,
          role: p.role,
          status: p.status as 'PLAYING' | 'NON_PLAYING' | 'IN_QUEUE' | 'INVITED' | 'GUEST',
        })),
      },
    },
  });
}

async function testActiveGameAccess(
  gameId: string,
  childGameId: string,
  ownerId: string,
  playingId: string,
  inQueueId: string,
  parentAdminId: string,
  outsiderId: string
) {
  await expectApiError(
    GameChatViewerAccessService.assertReadable(gameId, playingId, ChatType.ADMINS),
    403,
    'active: playing participant blocked from ADMINS'
  );
  await expectApiError(
    GameChatViewerAccessService.assertReadable(gameId, inQueueId, ChatType.PRIVATE),
    403,
    'active: in-queue participant blocked from PRIVATE'
  );

  await GameChatViewerAccessService.assertReadable(gameId, playingId, ChatType.PRIVATE);
  console.log('ok: active: playing participant can read PRIVATE');

  await GameChatViewerAccessService.assertReadable(gameId, ownerId, ChatType.ADMINS);
  console.log('ok: active: owner can read ADMINS');

  await GameChatViewerAccessService.assertReadable(childGameId, parentAdminId, ChatType.ADMINS);
  console.log('ok: active: parent-game owner can read child ADMINS');

  await expectApiError(
    GameChatViewerAccessService.assertReadable(gameId, outsiderId),
    403,
    'active: non-participant denied'
  );

  const activeAccess = await GameChatViewerAccessService.resolve(gameId, playingId);
  assert(activeAccess?.lifecycle === 'active', 'active resolve lifecycle');
  const legacy = await MessageService.validateGameAccess(gameId, playingId);
  assert(
    activeAccess?.lifecycle === 'active' && activeAccess.isParticipant === legacy.isParticipant,
    'active resolve isParticipant matches validateGameAccess'
  );
  console.log('ok: active resolve matches validateGameAccess');

  await GameChatViewerAccessService.assertWritable(gameId, playingId);
  console.log('ok: active: participant can write');
}

async function testArchivedGameAccess(
  prisma: typeof import('../../src/config/database').default,
  archivedGameId: string,
  archivedChildId: string,
  ownerId: string,
  playingId: string,
  inQueueId: string,
  parentAdminId: string,
  outsiderId: string
) {
  await expectApiError(
    GameChatViewerAccessService.assertReadable(archivedGameId, playingId, ChatType.ADMINS),
    403,
    'archived: playing participant blocked from ADMINS'
  );
  await expectApiError(
    GameChatViewerAccessService.assertReadable(archivedGameId, inQueueId, ChatType.PRIVATE),
    403,
    'archived: in-queue participant blocked from PRIVATE'
  );

  await GameChatViewerAccessService.assertReadable(archivedGameId, playingId, ChatType.PRIVATE);
  console.log('ok: archived: playing participant can read PRIVATE');

  await GameChatViewerAccessService.assertReadable(archivedGameId, ownerId, ChatType.ADMINS);
  console.log('ok: archived: owner can read ADMINS');

  await GameChatViewerAccessService.assertReadable(archivedChildId, parentAdminId, ChatType.ADMINS);
  console.log('ok: archived: parent-game owner can read child ADMINS via parentId');

  await expectApiError(
    GameChatViewerAccessService.assertReadable(archivedGameId, outsiderId),
    403,
    'archived: non-participant denied'
  );

  await expectApiError(
    GameChatViewerAccessService.assertWritable(archivedGameId, playingId),
    403,
    'archived: assertWritable rejects participant',
    'chat.threadArchived'
  );

  try {
    await GameChatViewerAccessService.assertWritable(archivedGameId, outsiderId);
    console.error('FAIL: archived: assertWritable non-participant — expected throw');
    process.exit(1);
  } catch (e) {
    if (!(e instanceof ApiError) || e.statusCode !== 403) throw e;
    if (e.data?.code === 'chat.threadArchived') {
      console.error('FAIL: archived: non-participant must not receive chat.threadArchived');
      process.exit(1);
    }
    console.log('ok: archived: assertWritable rejects non-participant without archive leak');
  }

  const archivedAccess = await GameChatViewerAccessService.resolve(archivedGameId, playingId);
  assert(archivedAccess?.lifecycle === 'archived', 'archived resolve lifecycle');
  assert(
    archivedAccess?.lifecycle === 'archived' &&
      archivedAccess.archivedAt instanceof Date,
    'archived resolve includes archivedAt'
  );
  console.log('ok: archived resolve shape');

  const messages = await prisma.chatMessage.findMany({
    where: { chatContextType: 'GAME', contextId: archivedGameId },
    select: { id: true },
  });
  assert(messages.length > 0, 'archived game chat messages still in DB');
  console.log('ok: archived game messages remain in database');
}

async function main() {
  dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

  if (!ensureDbUrl()) {
    console.log('game-chat-viewer-access: skipped (set DB_URL)');
    process.exit(0);
  }

  const { default: prisma } = await import('../../src/config/database');
  const city = await prisma.city.findFirst({ select: { id: true } });
  if (!city) throw new Error('no City row');

  const users = await prisma.user.findMany({
    where: { isAdmin: false },
    take: 6,
    select: { id: true },
  });
  if (users.length < 6) throw new Error('need at least 6 non-admin users');

  const [ownerId, playingId, inQueueId, parentAdminId, childPlayerId, outsiderId] = users.map(
    (u) => u.id
  );
  const suffix = `${Date.now()}`;
  const gameId = `qa-gcva-${suffix}`;
  const parentGameId = `qa-gcva-parent-${suffix}`;
  const childGameId = `qa-gcva-child-${suffix}`;
  const archivedGameId = `qa-gcva-arch-${suffix}`;
  const archivedChildId = `qa-gcva-arch-child-${suffix}`;
  const archivedParentId = `qa-gcva-arch-parent-${suffix}`;

  const start = new Date(Date.now() + 86_400_000);
  const end = new Date(start.getTime() + 3_600_000);
  const activeGameIds = [gameId, parentGameId, childGameId];
  const archivedGameIds = [archivedGameId, archivedChildId, archivedParentId];

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

  await seedCancelledGame(prisma, {
    id: archivedGameId,
    cityId: city.id,
    cancelledByUserId: ownerId,
    startTime: start,
    participants: [
      { userId: ownerId, role: ParticipantRole.OWNER, status: 'NON_PLAYING' },
      { userId: playingId, role: ParticipantRole.PARTICIPANT, status: 'PLAYING' },
      { userId: inQueueId, role: ParticipantRole.PARTICIPANT, status: 'IN_QUEUE' },
    ],
  });

  await prisma.game.create({
    data: {
      id: archivedParentId,
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

  await seedCancelledGame(prisma, {
    id: archivedChildId,
    cityId: city.id,
    cancelledByUserId: childPlayerId,
    startTime: start,
    parentId: archivedParentId,
    participants: [
      { userId: childPlayerId, role: ParticipantRole.PARTICIPANT, status: 'PLAYING' },
    ],
  });

  await seedGameMessage(prisma, archivedGameId, ownerId, ChatType.ADMINS, 'archived admin secret');
  await seedGameMessage(prisma, archivedGameId, ownerId, ChatType.PRIVATE, 'archived private note');
  await seedGameMessage(
    prisma,
    archivedChildId,
    childPlayerId,
    ChatType.ADMINS,
    'archived child admin secret'
  );

  try {
    await testActiveGameAccess(
      gameId,
      childGameId,
      ownerId,
      playingId,
      inQueueId,
      parentAdminId,
      outsiderId
    );
    await testArchivedGameAccess(
      prisma,
      archivedGameId,
      archivedChildId,
      ownerId,
      playingId,
      inQueueId,
      parentAdminId,
      outsiderId
    );

    const adminUser = await prisma.user.findFirst({
      where: { isAdmin: true },
      select: { id: true },
    });
    if (adminUser) {
      await GameChatViewerAccessService.assertReadable(
        archivedGameId,
        adminUser.id,
        ChatType.ADMINS
      );
      console.log('ok: archived: global admin can read ADMINS without snapshot');
      await expectApiError(
        GameChatViewerAccessService.assertWritable(archivedGameId, adminUser.id),
        403,
        'archived: global admin assertWritable still rejected',
        'chat.threadArchived'
      );
    } else {
      console.log('skip: archived global admin (no admin user in DB)');
    }

    const missing = await GameChatViewerAccessService.resolve(`missing-${suffix}`, ownerId);
    assert(missing === null, 'resolve returns null for missing game');
    console.log('ok: resolve null for missing game');

    await expectApiError(
      GameChatViewerAccessService.assertReadable(`missing-${suffix}`, ownerId),
      404,
      'assertReadable 404 for missing game'
    );
  } finally {
    for (const id of archivedGameIds) {
      await prisma.cancelledGameParticipant.deleteMany({ where: { gameId: id } });
      await prisma.chatMessage.deleteMany({ where: { contextId: id } });
      await prisma.cancelledGame.deleteMany({ where: { id } });
    }
    for (const id of [...activeGameIds, archivedParentId]) {
      await prisma.gameParticipant.deleteMany({ where: { gameId: id } });
      await prisma.game.deleteMany({ where: { id } });
    }
  }

  console.log('ok: game-chat-viewer-access');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
