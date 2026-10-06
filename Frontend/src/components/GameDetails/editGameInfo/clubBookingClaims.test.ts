import { describe, expect, it } from 'vitest';
import type { BookedCourtSlot } from '@/types';
import { findClubBookingConflicts, summarizeVerdicts, verifyClubBookingConflict, type OwnClubBooking } from './clubBookingClaims';

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

describe('verifyClubBookingConflict', () => {
  const window = { startMs: ms('2026-10-13T07:00:00Z'), endMs: ms('2026-10-13T08:00:00Z') };
  const conflict = { courtId: 'c4', start: '2026-10-13T07:00:00.000Z', end: '2026-10-13T09:00:00.000Z' };
  const own = (courtId: string, start: string, end: string): OwnClubBooking => ({
    externalBookingId: `b-${courtId}-${start}`,
    courtId,
    start,
    end,
    body: { externalBookingId: `b-${courtId}-${start}`, snapshot: {} as never },
  });

  it('cannot tell without a connected account', () => {
    expect(verifyClubBookingConflict(conflict, window, null)).toEqual({ kind: 'unknown' });
  });

  it('own: a reservation on that court covering the busy part of the window', () => {
    const mine = own('c4', '2026-10-13T07:00:00.000Z', '2026-10-13T08:00:00.000Z');
    expect(verifyClubBookingConflict(conflict, window, [mine])).toEqual({ kind: 'own', booking: mine });
  });

  it("someone else's: nothing in the account, another court, or only part of the window", () => {
    expect(verifyClubBookingConflict(conflict, window, [])).toEqual({ kind: 'notInAccount' });
    expect(verifyClubBookingConflict(conflict, window, [own('c3', '2026-10-13T07:00:00.000Z', '2026-10-13T08:00:00.000Z')])).toEqual({
      kind: 'notInAccount',
    });
    expect(verifyClubBookingConflict(conflict, window, [own('c4', '2026-10-13T07:00:00.000Z', '2026-10-13T07:30:00.000Z')])).toEqual({
      kind: 'notInAccount',
    });
  });

  it('summarizes a set', () => {
    const mine = own('c4', '2026-10-13T07:00:00.000Z', '2026-10-13T08:00:00.000Z');
    expect(summarizeVerdicts([{ kind: 'own', booking: mine }])).toBe('own');
    expect(summarizeVerdicts([{ kind: 'notInAccount' }, { kind: 'notInAccount' }])).toBe('notInAccount');
    expect(summarizeVerdicts([{ kind: 'own', booking: mine }, { kind: 'unknown' }])).toBe('unknown');
    expect(summarizeVerdicts([])).toBe('unknown');
  });
});
