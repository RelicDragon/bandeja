import { describe, expect, it } from 'vitest';
import type { BookedCourtSlot } from '@/types';
import { findClubBookingConflicts } from './clubBookingClaims';

const ms = (iso: string) => Date.parse(iso);

function block(courtId: string, start: string, end: string, patch: Partial<BookedCourtSlot> = {}): BookedCourtSlot {
  return { courtId, courtName: courtId, startTime: start, endTime: end, hasBookedCourt: false, clubBooked: true, slotKind: 'external', ...patch };
}

describe('findClubBookingConflicts', () => {
  const window = { startMs: ms('2026-10-07T18:00:00Z'), endMs: ms('2026-10-07T19:00:00Z') };

  it('reports the whole club range on a picked court that overlaps the window', () => {
    const out = findClubBookingConflicts([block('c1', '2026-10-07T15:00:00Z', '2026-10-07T20:00:00Z')], ['c1'], window);
    expect(out).toEqual([{ courtId: 'c1', start: '2026-10-07T15:00:00.000Z', end: '2026-10-07T20:00:00.000Z' }]);
  });

  it('merges back-to-back club bookings into one range', () => {
    const out = findClubBookingConflicts(
      [block('c1', '2026-10-07T17:00:00Z', '2026-10-07T18:30:00Z'), block('c1', '2026-10-07T18:30:00Z', '2026-10-07T20:00:00Z')],
      ['c1'],
      window,
    );
    expect(out).toEqual([{ courtId: 'c1', start: '2026-10-07T17:00:00.000Z', end: '2026-10-07T20:00:00.000Z' }]);
  });

  it('ignores admin holds, app games, other courts and bookings outside the window', () => {
    const out = findClubBookingConflicts(
      [
        block('c1', '2026-10-07T18:00:00Z', '2026-10-07T19:00:00Z', { holdBlocked: true, slotKind: 'hold', clubBooked: false }),
        block('c1', '2026-10-07T18:00:00Z', '2026-10-07T19:00:00Z', { clubBooked: false, slotKind: 'game', gameId: 'g2' }),
        block('c2', '2026-10-07T18:00:00Z', '2026-10-07T19:00:00Z'),
        block('c1', '2026-10-07T19:00:00Z', '2026-10-07T20:00:00Z'),
      ],
      ['c1'],
      window,
    );
    expect(out).toEqual([]);
  });
});
