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

const invitedAccess: GameChatSyncAccess = {
  game: { status: 'SCHEDULED' },
  participant: { status: 'INVITED', role: 'PLAYER' },
  isParentGameAdminOrOwner: false,
};

const guestAccess: GameChatSyncAccess = {
  game: { status: 'SCHEDULED' },
  participant: { status: 'GUEST', role: 'PLAYER' },
  isParentGameAdminOrOwner: false,
};

function testHidesRosterUpdatesFromInviteOnly(): void {
  const joinedPayload = {
    message: {
      chatType: ChatType.PUBLIC,
      senderId: null,
      content: JSON.stringify({
        type: 'USER_JOINED_GAME',
        variables: { userName: 'Alex' },
        text: 'Alex joined the game',
      }),
    },
  };
  const normalPayload = {
    message: { chatType: ChatType.PUBLIC, senderId: 'u1', content: 'hello' },
  };
  assert.equal(canUserSeeGameChatSyncEvent(joinedPayload, invitedAccess), false);
  assert.equal(canUserSeeGameChatSyncEvent(joinedPayload, guestAccess), false);
  assert.equal(canUserSeeGameChatSyncEvent(joinedPayload, playingParticipantAccess), true);
  assert.equal(canUserSeeGameChatSyncEvent(normalPayload, invitedAccess), true);
  assert.equal(canUserSeeGameChatSyncEvent(normalPayload, guestAccess), true);
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
  testHidesRosterUpdatesFromInviteOnly();
  console.log('gameChatSyncEventFilter.test.ts: ok');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
