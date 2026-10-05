import { describe, expect, it } from 'vitest';
import type { BookedCourtSlot, Club } from '@/types';
import { checkBookingOverlap } from './overlapCheck';

const club = { id: 'club', name: 'Club', cityId: 'city', address: '', city: { timezone: 'UTC' } } as unknown as Club;

function slot(patch: Partial<BookedCourtSlot>): BookedCourtSlot {
  return {
    courtId: 'c1',
    courtName: 'Court 1',
    startTime: '2026-10-10T18:00:00.000Z',
    endTime: '2026-10-10T19:30:00.000Z',
    hasBookedCourt: false,
    clubBooked: false,
    slotKind: 'game',
    ...patch,
  };
}

describe('checkBookingOverlap', () => {
  it('ignores the edited game own blocks', () => {
    const result = checkBookingOverlap([slot({ gameId: 'me', reservation: 'reserved' })], '18:00', 1.5, club, {
      excludeGameId: 'me',
    });
    expect(result).toEqual({ hasHardOverlap: false, hasSoftOverlap: false, softCount: 0, reservedGameCount: 0 });
  });

  it('counts another game with the court reserved as a conflict', () => {
    const result = checkBookingOverlap([slot({ gameId: 'other', reservation: 'reserved' })], '18:00', 1.5, club, {
      excludeGameId: 'me',
    });
    expect(result.hasHardOverlap).toBe(true);
    expect(result.reservedGameCount).toBe(1);
    expect(result.hasSoftOverlap).toBe(false);
  });

  it('keeps a planned app game a soft warning, per slot (not the game-level flag)', () => {
    const result = checkBookingOverlap(
      [slot({ gameId: 'other', reservation: 'planned', hasBookedCourt: true })],
      '18:00',
      1.5,
      club,
    );
    expect(result).toMatchObject({ hasHardOverlap: false, hasSoftOverlap: true, softCount: 1, reservedGameCount: 0 });
  });

  it('falls back to hasBookedCourt for payloads without per-slot reservation', () => {
    const result = checkBookingOverlap([slot({ hasBookedCourt: true })], '18:00', 1.5, club);
    expect(result).toMatchObject({ hasHardOverlap: true, reservedGameCount: 1 });
  });

  it('treats club bookings and holds as hard, and skips non-overlapping blocks', () => {
    expect(checkBookingOverlap([slot({ slotKind: 'external', clubBooked: true })], '18:00', 1, club).hasHardOverlap).toBe(true);
    expect(checkBookingOverlap([slot({ slotKind: 'hold', holdBlocked: true })], '18:00', 1, club).hasHardOverlap).toBe(true);
    expect(checkBookingOverlap([slot({ reservation: 'reserved' })], '20:00', 1, club).hasHardOverlap).toBe(false);
  });
});
