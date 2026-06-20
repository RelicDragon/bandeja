#!/usr/bin/env ts-node
/**
 * Game chat sync event filtering: participants only receive accessible chatType events.
 * Run: DB_URL=... npx ts-node -r dotenv/config scripts/tests/game-chat-sync-filter.ts
 */

import * as path from 'path';
import * as dotenv from 'dotenv';
import { ChatSyncEventType } from '@bandeja/chat-contract';
import { ChatType, EntityType, GameStatus, ParticipantRole } from '@prisma/client';
import { MessageService } from '../../src/services/chat/message.service';
import { getFilteredGameSyncEventsAfter } from '../../src/services/chat/gameChatSyncEventFilter';

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

  if (!ensureDbUrl()) {
    console.log('game-chat-sync-filter: skipped (set DB_URL)');
    process.exit(0);
  }

  const { default: prisma } = await import('../../src/config/database');
  const city = await prisma.city.findFirst({ select: { id: true } });
  if (!city) throw new Error('no City row');

  const users = await prisma.user.findMany({
    where: { isAdmin: false },
    take: 3,
    select: { id: true },
  });
  if (users.length < 3) throw new Error('need at least 3 non-admin users');

  const [ownerId, playingId, inQueueId] = users.map((u) => u.id);
  const suffix = `${Date.now()}`;
  const gameId = `qa-gcsf-${suffix}`;

  const start = new Date(Date.now() + 86_400_000);
  const end = new Date(start.getTime() + 3_600_000);

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

  try {
    await MessageService.createMessageWithEvent({
      chatContextType: 'GAME',
      contextId: gameId,
      senderId: ownerId,
      content: 'admin secret',
      mediaUrls: [],
      chatType: ChatType.ADMINS,
    });
    await MessageService.createMessageWithEvent({
      chatContextType: 'GAME',
      contextId: gameId,
      senderId: ownerId,
      content: 'private note',
      mediaUrls: [],
      chatType: ChatType.PRIVATE,
    });
    await MessageService.createMessageWithEvent({
      chatContextType: 'GAME',
      contextId: gameId,
      senderId: ownerId,
      content: 'public hello',
      mediaUrls: [],
      chatType: ChatType.PUBLIC,
    });

    const playingPull = await getFilteredGameSyncEventsAfter(gameId, 0, 200, playingId);
    const playingTypes = playingPull.events
      .filter((e) => e.eventType === ChatSyncEventType.MESSAGE_CREATED)
      .map((e) => (e.payload as { message?: { chatType?: string } }).message?.chatType);
    assert(!playingTypes.includes(ChatType.ADMINS), 'playing participant sync excludes ADMINS messages');
    assert(playingTypes.includes(ChatType.PUBLIC), 'playing participant sync includes PUBLIC messages');
    assert(playingTypes.includes(ChatType.PRIVATE), 'playing participant sync includes PRIVATE messages');
    console.log('ok: playing participant sync excludes ADMINS');

    const inQueuePull = await getFilteredGameSyncEventsAfter(gameId, 0, 200, inQueueId);
    const inQueueTypes = inQueuePull.events
      .filter((e) => e.eventType === ChatSyncEventType.MESSAGE_CREATED)
      .map((e) => (e.payload as { message?: { chatType?: string } }).message?.chatType);
    assert(!inQueueTypes.includes(ChatType.PRIVATE), 'in-queue participant sync excludes PRIVATE messages');
    assert(!inQueueTypes.includes(ChatType.ADMINS), 'in-queue participant sync excludes ADMINS messages');
    console.log('ok: in-queue participant sync excludes PRIVATE and ADMINS');

    const ownerPull = await getFilteredGameSyncEventsAfter(gameId, 0, 200, ownerId);
    const ownerTypes = ownerPull.events
      .filter((e) => e.eventType === ChatSyncEventType.MESSAGE_CREATED)
      .map((e) => (e.payload as { message?: { chatType?: string } }).message?.chatType);
    assert(ownerTypes.includes(ChatType.ADMINS), 'owner sync includes ADMINS messages');
    console.log('ok: owner sync includes ADMINS');
  } finally {
    await prisma.chatSyncEvent.deleteMany({ where: { contextId: gameId } });
    await prisma.conversationSyncState.deleteMany({ where: { contextId: gameId } });
    await prisma.chatMessage.deleteMany({ where: { contextId: gameId } });
    await prisma.gameParticipant.deleteMany({ where: { gameId } });
    await prisma.game.deleteMany({ where: { id: gameId } });
  }

  console.log('ok: game-chat-sync-filter');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
