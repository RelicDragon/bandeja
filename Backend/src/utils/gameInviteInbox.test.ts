import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  countPlayingParticipants,
  didPlayingSlotOpen,
  filterInboxVisibleInvites,
  isInviteInboxVisible,
  isInvitePlaySlotFull,
  isPlayingRosterFull,
  pendingInvitesForSlotOpenNotify,
} from './gameInviteInbox';

const now = new Date('2026-08-20T12:00:00.000Z');
const playing = (n: number) => Array.from({ length: n }, (_, i) => ({ status: 'PLAYING' as const, id: `p${i}` }));
const invited = { status: 'INVITED' as const };

{
  assert.equal(countPlayingParticipants([...playing(3), invited]), 3);
  assert.equal(countPlayingParticipants([]), 0);
  assert.equal(countPlayingParticipants(undefined), 0);
}

{
  const full = { maxParticipants: 4, participants: playing(4) };
  const open = { maxParticipants: 4, participants: playing(3) };
  assert.equal(isPlayingRosterFull(full), true);
  assert.equal(isPlayingRosterFull(open), false);
  assert.equal(isPlayingRosterFull({ entityType: 'BAR', maxParticipants: 4, participants: playing(4) }), false);
  assert.equal(isPlayingRosterFull({ maxParticipants: 0, participants: playing(1) }), false);
}

{
  assert.equal(
    didPlayingSlotOpen({ maxParticipants: 4, playingCountBefore: 4, playingCountAfter: 3 }),
    true,
  );
  assert.equal(
    didPlayingSlotOpen({ maxParticipants: 4, playingCountBefore: 3, playingCountAfter: 2 }),
    false,
  );
  assert.equal(
    didPlayingSlotOpen({ maxParticipants: 4, playingCountBefore: 4, playingCountAfter: 4 }),
    false,
  );
}

{
  const game = { maxParticipants: 4, participants: playing(4), status: 'ANNOUNCED' };
  assert.equal(
    isInviteInboxVisible({ status: 'INVITED', game }, now),
    false,
    'full roster hides pending invite without deleting it',
  );
  assert.equal(
    isInviteInboxVisible({ status: 'PENDING', game: { ...game, participants: playing(3) } }, now),
    true,
  );
  assert.equal(
    isInviteInboxVisible(
      { status: 'INVITED', inviteExpiresAt: '2026-08-20T11:00:00.000Z', game: { maxParticipants: 4, participants: playing(2) } },
      now,
    ),
    false,
  );
  assert.equal(
    isInviteInboxVisible({
      status: 'INVITED',
      game: { maxParticipants: 4, participants: playing(2), status: 'FINISHED' },
    }, now),
    false,
  );
  assert.equal(isInviteInboxVisible({ status: 'PLAYING', game: { maxParticipants: 4, participants: playing(2) } }, now), false);
}

{
  const mixGame = {
    maxParticipants: 4,
    genderTeams: 'MIX_PAIRS',
    participants: [
      { status: 'PLAYING' as const, user: { gender: 'MALE' } },
      { status: 'PLAYING' as const, user: { gender: 'MALE' } },
      { status: 'PLAYING' as const, user: { gender: 'FEMALE' } },
    ],
  };
  assert.equal(
    isInvitePlaySlotFull({ status: 'INVITED', gender: 'MALE', game: mixGame }),
    true,
    'MIX_PAIRS hides when the invitee gender bucket is full',
  );
  assert.equal(
    isInviteInboxVisible({ status: 'INVITED', gender: 'MALE', game: mixGame }, now),
    false,
  );
  assert.equal(
    isInviteInboxVisible({ status: 'INVITED', gender: 'FEMALE', game: mixGame }, now),
    true,
    'opposite gender still has a MIX_PAIRS slot',
  );
}

{
  const hidden = filterInboxVisibleInvites([
    { id: 'full', status: 'PENDING', game: { maxParticipants: 4, participants: playing(4) } },
    { id: 'open', status: 'PENDING', game: { maxParticipants: 4, participants: playing(3) } },
  ], now);
  assert.deepEqual(hidden.map((i) => i.id), ['open']);
}

{
  const pending = [
    { id: 'a', status: 'INVITED', game: { maxParticipants: 4, participants: playing(3) } },
    { id: 'expired', status: 'INVITED', inviteExpiresAt: '2026-08-20T11:00:00.000Z', game: { maxParticipants: 4, participants: playing(3) } },
  ];
  const toNotify = pendingInvitesForSlotOpenNotify({
    playingRemovedCount: 1,
    pending,
    now,
  });
  assert.deepEqual(toNotify.map((i) => i.id), ['a']);
  assert.deepEqual(
    pendingInvitesForSlotOpenNotify({
      playingRemovedCount: 1,
      pending: [
        { id: 'a', status: 'INVITED', game: { maxParticipants: 4, participants: playing(2) } },
      ],
      now,
    }),
    [],
    'leave that does not open a previously-full roster must not re-push',
  );
}

{
  const mixAfterMaleLeave = {
    maxParticipants: 4,
    genderTeams: 'MIX_PAIRS',
    participants: [
      { status: 'PLAYING' as const, user: { gender: 'MALE' } },
      { status: 'PLAYING' as const, user: { gender: 'FEMALE' } },
    ],
  };
  const pending = [
    { id: 'male', status: 'INVITED' as const, gender: 'MALE', game: mixAfterMaleLeave },
    { id: 'female', status: 'INVITED' as const, gender: 'FEMALE', game: mixAfterMaleLeave },
  ];
  assert.deepEqual(
    pendingInvitesForSlotOpenNotify({
      playingRemovedCount: 1,
      openedGender: 'MALE',
      pending,
      now,
    }).map((invite) => invite.id),
    ['male'],
  );
  assert.deepEqual(
    pendingInvitesForSlotOpenNotify({
      playingRemovedCount: 1,
      pending,
      now,
    }).map((invite) => invite.id),
    [],
    'MIX_PAIRS gender-slot notify requires the leaving player gender',
  );
}

{
  const feSrc = readFileSync(join(__dirname, '../../../Frontend/src/utils/gameInviteInbox.ts'), 'utf8');
  const beSrc = readFileSync(join(__dirname, './gameInviteInbox.ts'), 'utf8');
  assert.equal(
    feSrc.replace(/\s+/g, ''),
    beSrc.replace(/\s+/g, ''),
    'FE/BE gameInviteInbox source must stay in lockstep',
  );
}

console.log('ok: gameInviteInbox.test.ts');
