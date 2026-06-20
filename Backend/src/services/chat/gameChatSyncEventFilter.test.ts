import assert from 'node:assert/strict';
import { ChatType } from '@prisma/client';
import {
  canUserSeeGameChatSyncEvent,
  filterGameChatSyncEvents,
  type GameChatSyncAccess,
} from './gameChatSyncEventFilter';

const playingParticipantAccess: GameChatSyncAccess = {
  game: { status: 'SCHEDULED' },
  participant: { status: 'PLAYING', role: 'PARTICIPANT' },
  isParentGameAdminOrOwner: false,
};

const ownerAccess: GameChatSyncAccess = {
  game: { status: 'SCHEDULED' },
  participant: { status: 'NON_PLAYING', role: 'OWNER' },
  isParentGameAdminOrOwner: false,
};

function testCanSeeByChatType(): void {
  assert.equal(
    canUserSeeGameChatSyncEvent({ message: { chatType: ChatType.ADMINS } }, playingParticipantAccess),
    false
  );
  assert.equal(
    canUserSeeGameChatSyncEvent({ message: { chatType: ChatType.PRIVATE } }, playingParticipantAccess),
    true
  );
  assert.equal(
    canUserSeeGameChatSyncEvent({ chatType: ChatType.ADMINS, messageId: 'm1' }, ownerAccess),
    true
  );
  assert.equal(canUserSeeGameChatSyncEvent({ messageId: 'm1' }, playingParticipantAccess), true);
}

function testFilterEvents(): void {
  const events = [
    { id: '1', seq: 1, payload: { message: { chatType: ChatType.PUBLIC } } },
    { id: '2', seq: 2, payload: { message: { chatType: ChatType.ADMINS } } },
    { id: '3', seq: 3, payload: { chatType: ChatType.PRIVATE } },
  ];
  const filtered = filterGameChatSyncEvents(events, playingParticipantAccess);
  assert.deepEqual(
    filtered.map((e) => e.seq),
    [1, 3]
  );
}

async function run(): Promise<void> {
  testCanSeeByChatType();
  testFilterEvents();
  console.log('gameChatSyncEventFilter.test.ts: ok');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
