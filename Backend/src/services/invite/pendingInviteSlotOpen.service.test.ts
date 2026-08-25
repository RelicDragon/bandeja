import assert from 'node:assert/strict';
import { pendingInvitesForSlotOpenNotify } from '../../utils/gameInviteInbox';
import { deliverSlotOpenInviteNotifications } from './pendingInviteSlotOpenNotify';

const now = new Date('2026-08-20T12:00:00.000Z');
const playing = (n: number) => Array.from({ length: n }, (_, i) => ({ status: 'PLAYING' as const, userId: `u${i}` }));

void (async () => {
  const pending = [
    {
      id: 'inv-1',
      status: 'INVITED' as const,
      inviteExpiresAt: null,
      game: { maxParticipants: 4, participants: playing(3), entityType: 'GAME' },
    },
    {
      id: 'inv-2',
      status: 'INVITED' as const,
      inviteExpiresAt: null,
      game: { maxParticipants: 4, participants: playing(3), entityType: 'GAME' },
    },
  ];
  const selected = pendingInvitesForSlotOpenNotify({
    playingRemovedCount: 1,
    pending,
    now,
  });
  const sendPushCalls: string[] = [];
  const emitCalls: string[] = [];
  const notified = await deliverSlotOpenInviteNotifications(
    selected.map((row) => ({
      id: row.id,
      receiverId: `user-${row.id}`,
      gameId: 'g1',
      status: 'PENDING' as const,
      message: null,
      expiresAt: null,
      createdAt: now,
      updatedAt: now,
      receiver: null,
      sender: {},
      game: row.game,
    })) as never,
    {
      sendPush: async (invite) => {
        sendPushCalls.push(invite.id);
      },
      emitNewInvite: (receiverId, invite) => {
        emitCalls.push(`${receiverId}:${invite.id}`);
      },
    },
  );
  assert.equal(notified, 2);
  assert.deepEqual(sendPushCalls, ['inv-1', 'inv-2']);
  assert.deepEqual(emitCalls, ['user-inv-1:inv-1', 'user-inv-2:inv-2']);

  const skipped = pendingInvitesForSlotOpenNotify({
    playingRemovedCount: 1,
    pending: [
      {
        id: 'inv-1',
        status: 'INVITED' as const,
        game: { maxParticipants: 4, participants: playing(4) },
      },
    ],
    now,
  });
  assert.deepEqual(skipped, []);

  console.log('ok: pendingInviteSlotOpen.service.test.ts');
})();
