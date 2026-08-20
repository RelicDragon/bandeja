import { describe, expect, it } from 'vitest';
import {
  countPlayingParticipants,
  didPlayingSlotOpen,
  filterInboxVisibleInvites,
  isInviteInboxVisible,
  isPlayingRosterFull,
  pendingInvitesForSlotOpenNotify,
} from './gameInviteInbox';

const now = new Date('2026-08-20T12:00:00.000Z');
const playing = (n: number) => Array.from({ length: n }, () => ({ status: 'PLAYING' as const }));

describe('gameInviteInbox', () => {
  it('counts only PLAYING toward slots', () => {
    expect(countPlayingParticipants([...playing(3), { status: 'INVITED' }])).toBe(3);
  });

  it('hides inbox invites while PLAYING is at maxParticipants', () => {
    const fullGame = { maxParticipants: 4, participants: playing(4), entityType: 'GAME' };
    expect(isPlayingRosterFull(fullGame)).toBe(true);
    expect(isInviteInboxVisible({ status: 'PENDING', game: fullGame }, now)).toBe(false);
    expect(
      isInviteInboxVisible({ status: 'PENDING', game: { ...fullGame, participants: playing(3) } }, now),
    ).toBe(true);
  });

  it('does not treat BAR occupancy as full', () => {
    expect(
      isPlayingRosterFull({ entityType: 'BAR', maxParticipants: 4, participants: playing(4) }),
    ).toBe(false);
  });

  it('leave that opens a previously full roster selects pending invites', () => {
    const pending = [
      { id: 'a', status: 'PENDING', game: { maxParticipants: 4, participants: playing(3) } },
    ];
    expect(
      pendingInvitesForSlotOpenNotify({
        maxParticipants: 4,
        playingCountAfter: 3,
        playingRemovedCount: 1,
        pending,
        now,
      }).map((invite) => invite.id),
    ).toEqual(['a']);
    expect(
      didPlayingSlotOpen({ maxParticipants: 4, playingCountBefore: 3, playingCountAfter: 2 }),
    ).toBe(false);
  });

  it('filters home/badge lists without dropping INVITED rows from the game', () => {
    const invites = filterInboxVisibleInvites(
      [
        { id: 'hidden', status: 'PENDING', game: { maxParticipants: 4, participants: playing(4) } },
        { id: 'shown', status: 'PENDING', game: { maxParticipants: 4, participants: playing(3) } },
      ],
      now,
    );
    expect(invites.map((invite) => invite.id)).toEqual(['shown']);
  });
});
