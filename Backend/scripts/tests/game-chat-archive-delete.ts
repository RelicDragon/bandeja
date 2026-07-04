#!/usr/bin/env ts-node
/**
 * Game chat archive on delete: THREAD_ARCHIVED, read access, write rejection.
 * Run: DB_URL=... npx ts-node -r dotenv/config scripts/tests/game-chat-archive-delete.ts
 */

import * as path from 'path';
import * as dotenv from 'dotenv';
import { ChatSyncEventType } from '@bandeja/chat-contract';
import { ChatType, EntityType, GameStatus, ParticipantRole } from '@prisma/client';
import { ApiError } from '../../src/utils/ApiError';
import { GameDeleteService } from '../../src/services/game/delete.service';
import { GameReadService } from '../../src/services/game/read.service';
import { MessageService } from '../../src/services/chat/message.service';
import { GameChatViewerAccessService } from '../../src/services/chat/gameChatViewerAccess.service';
import { ReadReceiptService } from '../../src/services/chat/readReceipt.service';
import { ReactionService } from '../../src/services/chat/reaction.service';

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

async function main() {
  dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

  if (!ensureDbUrl()) {
    console.log('game-chat-archive-delete: skipped (set DB_URL)');
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

  const [ownerId, playingId, outsiderId] = users.map((u) => u.id);
  const suffix = `${Date.now()}`;
  const gameId = `qa-gcad-${suffix}`;
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
        ],
      },
    },
  });

  const message = await prisma.chatMessage.create({
    data: {
      chatContextType: 'GAME',
      contextId: gameId,
      senderId: ownerId,
      content: `archive-delete test ${suffix}`,
      chatType: ChatType.PUBLIC,
    },
  });

  await prisma.chatDraft.create({
    data: {
      userId: playingId,
      chatContextType: 'GAME',
      contextId: gameId,
      chatType: ChatType.PUBLIC,
      content: 'unsent draft',
      mentionIds: [],
    },
  });

  try {
    await GameDeleteService.deleteGame(gameId, ownerId);
    console.log('ok: delete game');

    const snapshot = await prisma.cancelledGameParticipant.findMany({
      where: { gameId },
      select: { userId: true, role: true, status: true },
    });
    assert(snapshot.length === 2, 'participant snapshot count');
    assert(
      snapshot.some((p) => p.userId === playingId && p.status === 'PLAYING'),
      'playing participant snapshotted'
    );
    console.log('ok: participant snapshot');

    const draftsLeft = await prisma.chatDraft.count({
      where: { chatContextType: 'GAME', contextId: gameId },
    });
    assert(draftsLeft === 0, 'drafts deleted on archive');
    console.log('ok: drafts deleted');

    const syncEvents = await prisma.chatSyncEvent.findMany({
      where: { contextType: 'GAME', contextId: gameId },
      select: { eventType: true, payload: true },
      orderBy: { seq: 'asc' },
    });
    const archived = syncEvents.filter((e) => e.eventType === ChatSyncEventType.THREAD_ARCHIVED);
    const invalidated = syncEvents.filter(
      (e) => e.eventType === ChatSyncEventType.THREAD_LOCAL_INVALIDATE
    );
    assert(archived.length === 1, 'exactly one THREAD_ARCHIVED');
    assert(invalidated.length === 0, 'no THREAD_LOCAL_INVALIDATE');
    const payload = archived[0]!.payload as { reason?: string; archivedAt?: string };
    assert(payload.reason === 'game_cancelled', 'THREAD_ARCHIVED reason');
    assert(typeof payload.archivedAt === 'string', 'THREAD_ARCHIVED archivedAt');
    console.log('ok: THREAD_ARCHIVED sync event');

    const messagesLeft = await prisma.chatMessage.count({
      where: { chatContextType: 'GAME', contextId: gameId },
    });
    assert(messagesLeft === 1, 'chat messages retained');
    console.log('ok: messages retained');

    const missed = await MessageService.getMissedMessages(
      'GAME',
      gameId,
      playingId,
      undefined,
      ChatType.PUBLIC
    );
    assert(missed.messages.length === 1, 'participant missed messages');
    assert(missed.threadInvalidated !== true, 'no threadInvalidated flag');
    console.log('ok: participant read missed messages');

    await expectApiError(
      MessageService.getMissedMessages('GAME', gameId, outsiderId, undefined, ChatType.PUBLIC),
      403,
      'non-participant read denied'
    );

    await expectApiError(
      MessageService.createMessage({
        chatContextType: 'GAME',
        contextId: gameId,
        senderId: playingId,
        content: 'should fail',
        chatType: ChatType.PUBLIC,
        mediaUrls: [],
        mentionIds: [],
      }),
      403,
      'create message blocked',
      'chat.threadArchived'
    );

    await expectApiError(
      ReactionService.addReaction(message.id, playingId, '👍'),
      403,
      'reaction blocked',
      'chat.threadArchived'
    );

    await expectApiError(
      ReadReceiptService.markMessageAsRead(message.id, playingId),
      403,
      'read receipt write blocked',
      'chat.threadArchived'
    );

    await expectApiError(
      GameChatViewerAccessService.assertWritable(gameId, playingId),
      403,
      'assertWritable archived',
      'chat.threadArchived'
    );

    try {
      await GameReadService.getGameById(gameId, playingId);
      console.error('FAIL: getGameById — expected 410');
      process.exit(1);
    } catch (e) {
      if (!(e instanceof ApiError) || e.statusCode !== 410) throw e;
      assert(e.data?.chatArchived === true, '410 chatArchived');
      assert(Array.isArray(e.data?.participants), '410 participants array');
      assert((e.data?.participants as unknown[]).length === 2, '410 participant count');
      console.log('ok: cancelled game 410 includes chat stub');
    }

    const activeGameId = `qa-gcad-active-${suffix}`;
    await prisma.game.create({
      data: {
        id: activeGameId,
        entityType: EntityType.GAME,
        gameType: 'CLASSIC',
        cityId: city.id,
        startTime: start,
        endTime: end,
        timeIsSet: true,
        status: GameStatus.ANNOUNCED,
        participants: {
          create: [{ userId: ownerId, role: ParticipantRole.OWNER, status: 'NON_PLAYING' }],
        },
      },
    });
    await GameChatViewerAccessService.assertWritable(activeGameId, ownerId);
    console.log('ok: active game write unchanged');

    await prisma.gameParticipant.deleteMany({ where: { gameId: activeGameId } });
    await prisma.game.deleteMany({ where: { id: activeGameId } });
  } finally {
    await prisma.chatSyncEvent.deleteMany({
      where: { contextType: 'GAME', contextId: gameId },
    });
    await prisma.chatMessage.deleteMany({ where: { contextId: gameId } });
    await prisma.cancelledGameParticipant.deleteMany({ where: { gameId } });
    await prisma.cancelledGame.deleteMany({ where: { id: gameId } });
  }

  console.log('ok: game-chat-archive-delete');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
