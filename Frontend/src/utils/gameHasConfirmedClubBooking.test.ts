import { describe, expect, it } from 'vitest';
import {
  evaluateGameLinkedBookingCoverage,
  gameLinkedBookingIdsNeedingAttention,
  isExternallyFullyBookedGame,
  resolveGameBookingBadgeKind,
} from './gameHasConfirmedClubBooking';
import type { Game } from '@/types';

const baseGame = {
  id: 'g1',
  startTime: '2026-06-12T10:00:00.000Z',
  endTime: '2026-06-12T12:00:00.000Z',
  maxParticipants: 4,
  timeIsSet: true,
  hasBookedCourt: true,
  court: {
    id: 'c1',
    name: 'Court 1',
    club: {
      id: 'club1',
      name: 'Club',
      integrationType: 'BOOKTIME',
      integrationConfig: { companyId: 'co1' },
      city: { timezone: 'Europe/Belgrade' },
    },
  },
} as Game;

describe('resolveGameBookingBadgeKind', () => {
  it('returns manual for hasBookedCourt without linked bookings', () => {
    expect(resolveGameBookingBadgeKind(baseGame)).toBe('manual');
  });

  it('returns external_full when linked bookings fully cover the game', () => {
    const game = {
      ...baseGame,
      linkedBookings: [
        {
          id: 'l1',
          externalBookingId: 'b1',
          externalBookingProvider: 'BOOKTIME',
          bookingStart: baseGame.startTime,
          bookingEnd: baseGame.endTime,
        },
      ],
    } as Game;

    expect(resolveGameBookingBadgeKind(game)).toBe('external_full');
    expect(isExternallyFullyBookedGame(game)).toBe(true);
  });

  it('returns external_partial when linked bookings do not fully cover the game', () => {
    const game = {
      ...baseGame,
      linkedBookings: [
        {
          id: 'l1',
          externalBookingId: 'b1',
          externalBookingProvider: 'BOOKTIME',
          bookingStart: baseGame.startTime,
          bookingEnd: '2026-06-12T11:00:00.000Z',
        },
      ],
    } as Game;

    expect(resolveGameBookingBadgeKind(game)).toBe('external_partial');
    expect(isExternallyFullyBookedGame(game)).toBe(false);
  });

  it('prefers bookingStatus from API over linkedBookings computation', () => {
    const game = {
      ...baseGame,
      bookingStatus: 'EXTERNAL_FULL',
      linkedBookings: [],
    } as Game;

    expect(resolveGameBookingBadgeKind(game)).toBe('external_full');
    expect(isExternallyFullyBookedGame(game)).toBe(true);
  });

  it('returns none when court is not marked booked and there are no linked bookings', () => {
    expect(
      resolveGameBookingBadgeKind({
        ...baseGame,
        hasBookedCourt: false,
      }),
    ).toBe('none');
  });
});

describe('evaluateGameLinkedBookingCoverage', () => {
  it('evaluates coverage from linked bookings even when club integration fields are omitted from list payloads', () => {
    const game = {
      ...baseGame,
      court: {
        ...baseGame.court!,
        club: {
          id: 'club1',
          name: 'Club',
          city: { timezone: 'Europe/Belgrade' },
        },
      },
      linkedBookings: [
        {
          id: 'l1',
          externalBookingId: 'b1',
          externalBookingProvider: 'BOOKTIME',
          bookingStart: baseGame.startTime,
          bookingEnd: baseGame.endTime,
        },
      ],
    } as Game;

    expect(evaluateGameLinkedBookingCoverage(game)?.fullyCovered).toBe(true);
    expect(resolveGameBookingBadgeKind(game)).toBe('external_full');
  });

  it('falls back to game city timezone when club timezone is missing', () => {
    const game = {
      ...baseGame,
      city: { id: 'city1', name: 'City', timezone: 'Europe/Belgrade' },
      court: {
        ...baseGame.court!,
        club: {
          id: 'club1',
          name: 'Club',
        },
      },
      linkedBookings: [
        {
          id: 'l1',
          externalBookingId: 'b1',
          externalBookingProvider: 'BOOKTIME',
          bookingStart: baseGame.startTime,
          bookingEnd: baseGame.endTime,
        },
      ],
    } as Game;

    expect(resolveGameBookingBadgeKind(game)).toBe('external_full');
  });
});

describe('gameLinkedBookingIdsNeedingAttention (time change)', () => {
  const link = (id: string, bookingStart: string, bookingEnd: string) => ({
    id,
    externalBookingId: `ext-${id}`,
    externalBookingProvider: 'BOOKTIME' as const,
    bookingStart,
    bookingEnd,
  });

  it('flags nothing while the booking still covers the game', () => {
    const game = {
      ...baseGame,
      linkedBookings: [link('l1', baseGame.startTime, baseGame.endTime)],
    } as Game;
    expect([...gameLinkedBookingIdsNeedingAttention(game)]).toEqual([]);
  });

  it('flags the booking left behind when the game moved', () => {
    const game = {
      ...baseGame,
      startTime: '2026-06-12T14:00:00.000Z',
      endTime: '2026-06-12T16:00:00.000Z',
      linkedBookings: [link('l1', baseGame.startTime, baseGame.endTime)],
    } as Game;
    expect([...gameLinkedBookingIdsNeedingAttention(game)]).toEqual(['l1']);
  });

  it('flags nothing for a game without a time', () => {
    const game = {
      ...baseGame,
      timeIsSet: false,
      startTime: '2026-06-12T14:00:00.000Z',
      endTime: '2026-06-12T16:00:00.000Z',
      linkedBookings: [link('l1', baseGame.startTime, baseGame.endTime)],
    } as Game;
    expect(gameLinkedBookingIdsNeedingAttention(game).size).toBe(0);
  });
});
