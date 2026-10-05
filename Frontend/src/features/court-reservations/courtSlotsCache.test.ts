import { describe, expect, it } from 'vitest';
import type { Game } from '@/types';
import type { CourtSlotsView } from '@/api/courtSlots';
import {
  applyCourtSlotsWrite,
  mergeAcceptUpstreamIntoGame,
  mergeCourtSlotsViewIntoGame,
  mergeLinkedBookingsIntoGame,
} from './courtSlotsCache';
import { deriveGameCourtReservations } from './courtReservationsInput';

const base = {
  id: 'g1',
  startTime: '2026-10-05T17:00:00.000Z',
  endTime: '2026-10-05T19:00:00.000Z',
  timeIsSet: true,
  maxParticipants: 8,
  courtSlotCount: 2,
  hasBookedCourt: false,
  bookingStatus: 'NONE',
  reportedAnyCourtCount: 0,
  gameCourts: [
    { id: 'gc1', gameId: 'g1', courtId: 'c1', order: 0, reservation: 'NONE' },
    { id: 'gc2', gameId: 'g1', courtId: 'c2', order: 1, reservation: 'NONE' },
  ],
  linkedBookings: [],
  participants: [],
} as unknown as Game;

const view: CourtSlotsView = {
  gameId: 'g1',
  courtId: 'c1',
  hasBookedCourt: true,
  bookingStatus: 'MANUAL',
  reportedAnyCourtCount: 0,
  courtSlotCount: 2,
  gameCourts: [
    { id: 'gc1', courtId: 'c1', order: 0, reservation: 'REPORTED' },
    { id: 'gc2', courtId: 'c2', order: 1, reservation: 'NONE' },
  ],
  linkedBookings: [],
};

describe('court-slot write → game (immediate card update)', () => {
  it('PUT court-slots: the returned slot view replaces the game slots, so the card re-derives at once', () => {
    expect(deriveGameCourtReservations(base).slots.filter((s) => s.state === 'reported')).toHaveLength(0);
    const next = mergeCourtSlotsViewIntoGame(base, view);
    expect(next).not.toBe(base);
    expect(next.id).toBe('g1');
    expect(next.hasBookedCourt).toBe(true);
    expect(next.bookingStatus).toBe('MANUAL');
    expect(deriveGameCourtReservations(next).slots.filter((s) => s.state === 'reported')).toHaveLength(1);
  });

  it('link / unlink: the returned link list replaces the game links', () => {
    const links = [
      { id: 'l1', externalBookingId: 'b1', externalBookingProvider: 'BOOKTIME', courtId: 'c1', gameCourtId: 'gc1' },
    ];
    const next = mergeLinkedBookingsIntoGame(base, links);
    expect(next.linkedBookings).toEqual(links);
    expect(applyCourtSlotsWrite(base, { kind: 'links', links: [] })?.linkedBookings).toEqual([]);
  });

  it('accept-upstream: applies the moved time and links; nothing to apply → same game', () => {
    const next = mergeAcceptUpstreamIntoGame(base, {
      startTime: '2026-10-05T18:00:00.000Z',
      endTime: '2026-10-05T20:00:00.000Z',
      linkedBookings: [],
    });
    expect(next.startTime).toBe('2026-10-05T18:00:00.000Z');
    expect(next.endTime).toBe('2026-10-05T20:00:00.000Z');
    expect(mergeAcceptUpstreamIntoGame(base, undefined)).toBe(base);
  });

  it('a write with no payload (follow-up done) leaves the game to the refresh', () => {
    expect(applyCourtSlotsWrite(base, { kind: 'none' })).toBeNull();
    expect(applyCourtSlotsWrite(base, { kind: 'slots', view })?.bookingStatus).toBe('MANUAL');
  });
});
