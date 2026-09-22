/**
 * PRD 359 — when the join CTA gains a number and when it stays as it was.
 */
import { describe, expect, it } from 'vitest';
import { resolveGameCardJoinLabel } from './gameCardJoinLabel';

const open = (openSeats: number | null, queueLength = 0) =>
  resolveGameCardJoinLabel({ hasFreeSlots: true, openSeats, queueLength });

const full = (queueLength: number, openSeats: number | null = 0) =>
  resolveGameCardJoinLabel({ hasFreeSlots: false, openSeats, queueLength });

describe('resolveGameCardJoinLabel — seats', () => {
  it('names the count only when seats are scarce', () => {
    expect(open(1)).toEqual({ kind: 'joinSeatsLeft', seats: 1 });
    expect(open(2)).toEqual({ kind: 'joinSeatsLeft', seats: 2 });
    expect(open(3)).toEqual({ kind: 'join' });
    expect(open(7)).toEqual({ kind: 'join' });
  });

  it('never says "0 seats left"', () => {
    // A MIX_PAIRS game with room overall but none in the viewer's half: the
    // plain label plus the existing gender gate, not a contradiction.
    expect(open(0)).toEqual({ kind: 'join' });
  });

  it('falls back to the plain label when the count is not provable', () => {
    expect(open(null)).toEqual({ kind: 'join' });
  });

  it('ignores the queue while there is still room', () => {
    expect(open(1, 5)).toEqual({ kind: 'joinSeatsLeft', seats: 1 });
    expect(open(4, 5)).toEqual({ kind: 'join' });
  });
});

describe('resolveGameCardJoinLabel — queue', () => {
  it('states how many are already waiting', () => {
    expect(full(1)).toEqual({ kind: 'queueWaiting', waiting: 1 });
    expect(full(2)).toEqual({ kind: 'queueWaiting', waiting: 2 });
    // Deliberately unbounded: an honest 9 beats a surprise on the game page.
    expect(full(9)).toEqual({ kind: 'queueWaiting', waiting: 9 });
  });

  it('leaves an empty queue unchanged', () => {
    expect(full(0)).toEqual({ kind: 'queue' });
  });

  it('never shows a seat count on a full game', () => {
    expect(full(0, 2)).toEqual({ kind: 'queue' });
    expect(full(3, 2)).toEqual({ kind: 'queueWaiting', waiting: 3 });
  });
});
