import assert from 'node:assert/strict';
import { ChatType } from '@prisma/client';
import { canParticipantSeeGameChatMessage } from './gameChatVisibility';

function testPrivateVisibleForPlayingAndNonPlaying(): void {
  const game = { status: 'SCHEDULED' };
  assert.equal(
    canParticipantSeeGameChatMessage({ status: 'PLAYING', role: 'PLAYER' }, game, ChatType.PRIVATE),
    true
  );
  assert.equal(
    canParticipantSeeGameChatMessage({ status: 'NON_PLAYING', role: 'PLAYER' }, game, ChatType.PRIVATE),
    true
  );
  assert.equal(
    canParticipantSeeGameChatMessage({ status: 'IN_QUEUE', role: 'PLAYER' }, game, ChatType.PRIVATE),
    false
  );
}

function testAdminsOnlyForAdminRoles(): void {
  const game = { status: 'SCHEDULED' };
  assert.equal(
    canParticipantSeeGameChatMessage({ status: 'PLAYING', role: 'PLAYER' }, game, ChatType.ADMINS),
    false
  );
  assert.equal(
    canParticipantSeeGameChatMessage({ status: 'PLAYING', role: 'ADMIN' }, game, ChatType.ADMINS),
    true
  );
}

async function run(): Promise<void> {
  testPrivateVisibleForPlayingAndNonPlaying();
  testAdminsOnlyForAdminRoles();
  console.log('gameChatVisibility.test.ts: ok');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
