import { describe, expect, it } from 'vitest';
import { mergeClubFollowUps, type ClubFollowUp } from './clubFollowUps';

const base: ClubFollowUp = {
  id: 'x',
  reason: 'ask_club',
  provider: null,
  courtId: 'c1',
  externalBookingId: null,
  start: '2026-10-10T17:00:00.000Z',
  end: '2026-10-10T19:00:00.000Z',
};

describe('mergeClubFollowUps', () => {
  it('drops the journal copy of a server step that has no provider booking', () => {
    const server = { ...base, id: 'run1:k1', changeId: 'run1', idempotencyKey: 'k1' };
    const local = { ...base, id: 'run:k1', changeId: 'run1', idempotencyKey: 'k1' };
    expect(mergeClubFollowUps([server], [local])).toEqual([server]);
  });

  it('drops a second follow-up for the same provider booking and reason', () => {
    const a = { ...base, id: 'a', reason: 'cancel_old' as const, externalBookingId: 'b1' };
    const b = { ...base, id: 'b', reason: 'cancel_old' as const, externalBookingId: 'b1' };
    expect(mergeClubFollowUps([a], [b])).toEqual([a]);
  });

  it('keeps distinct follow-ups', () => {
    const a = { ...base, id: 'a', changeId: 'r', idempotencyKey: 'k1' };
    const b = { ...base, id: 'b', changeId: 'r', idempotencyKey: 'k2' };
    expect(mergeClubFollowUps([a, b])).toHaveLength(2);
  });
});
