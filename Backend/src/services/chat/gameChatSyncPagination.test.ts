import assert from 'node:assert/strict';
import { ChatContextType, ChatSyncEventType, ChatType } from '@prisma/client';
import prisma from '../../config/database';
import { ChatSyncEventService } from './chatSyncEvent.service';
import { getFilteredGameSyncEventsAfter } from './gameChatSyncEventFilter';

function event(seq: number, chatType: ChatType) {
  return {
    id: `event-${seq}`,
    contextType: ChatContextType.GAME,
    contextId: 'game-1',
    seq,
    eventType: ChatSyncEventType.MESSAGE_CREATED,
    payload: { message: { chatType } },
    createdAt: new Date('2026-09-16T00:00:00Z'),
  };
}

async function run(): Promise<void> {
  let events = [event(1, ChatType.ADMINS), event(2, ChatType.ADMINS)];
  const originalGame = prisma.game.findUnique;
  const originalUser = prisma.user.findUnique;
  const originalParticipant = prisma.gameParticipant.findFirst;
  const originalFetch = ChatSyncEventService.getEventsAfter;
  prisma.game.findUnique = (async () => ({ id: 'game-1', status: 'ANNOUNCED', parentId: null })) as unknown as typeof originalGame;
  prisma.user.findUnique = (async () => ({ isAdmin: false })) as unknown as typeof originalUser;
  prisma.gameParticipant.findFirst = (async (args: { where?: { role?: unknown } }) =>
    args.where?.role ? null : { status: 'PLAYING', role: 'PARTICIPANT' }
  ) as unknown as typeof originalParticipant;
  ChatSyncEventService.getEventsAfter = async (_contextType, _contextId, after, limit) =>
    events.filter((e) => e.seq > after).slice(0, limit);
  try {
    const hidden = await getFilteredGameSyncEventsAfter('game-1', 0, 3, 'viewer');
    assert.deepEqual(hidden, { events: [], hasMore: false, nextAfterSeq: 2 });

    // The scan budget must yield a usable cursor even when every scanned event is hidden.
    events = Array.from({ length: 25 }, (_, i) => event(i + 1, i === 24 ? ChatType.PUBLIC : ChatType.ADMINS));
    const scanned = await getFilteredGameSyncEventsAfter('game-1', 0, 2, 'viewer');
    assert.deepEqual(scanned, { events: [], hasMore: true, nextAfterSeq: 24 });
    const resumed = await getFilteredGameSyncEventsAfter('game-1', scanned.nextAfterSeq, 2, 'viewer');
    assert.deepEqual(resumed.events.map((e) => e.seq), [25]);
    assert.equal(resumed.nextAfterSeq, 25);
    assert.equal(resumed.hasMore, false);

    // A batch can overflow the visible page after preceding batches were partly hidden.
    events = [event(1, ChatType.PUBLIC), event(2, ChatType.ADMINS), event(3, ChatType.PUBLIC), event(4, ChatType.PUBLIC)];
    const first = await getFilteredGameSyncEventsAfter('game-1', 0, 2, 'viewer');
    assert.deepEqual(first.events.map((e) => e.seq), [1, 3]);
    assert.equal(first.nextAfterSeq, 3);
    assert.equal(first.hasMore, true);
    const second = await getFilteredGameSyncEventsAfter('game-1', first.nextAfterSeq, 2, 'viewer');
    assert.deepEqual(second.events.map((e) => e.seq), [4]);
    assert.equal(second.hasMore, false);

    events = [event(1, ChatType.PUBLIC), event(2, ChatType.ADMINS), event(3, ChatType.ADMINS)];
    const tail = await getFilteredGameSyncEventsAfter('game-1', 0, 4, 'viewer');
    assert.deepEqual(tail.events.map((e) => e.seq), [1]);
    assert.equal(tail.nextAfterSeq, 3);
    assert.equal(tail.hasMore, false);

    events = [];
    const empty = await getFilteredGameSyncEventsAfter('game-1', 7, 2, 'viewer');
    assert.deepEqual(empty, { events: [], hasMore: false, nextAfterSeq: 7 });
    console.log('gameChatSyncPagination.test.ts: ok');
  } finally {
    prisma.game.findUnique = originalGame;
    prisma.user.findUnique = originalUser;
    prisma.gameParticipant.findFirst = originalParticipant;
    ChatSyncEventService.getEventsAfter = originalFetch;
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
