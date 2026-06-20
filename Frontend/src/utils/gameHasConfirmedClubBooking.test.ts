import { describe, expect, it } from 'vitest';
import {
  evaluateGameLinkedBookingCoverage,
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
  it('returns null when club has no booking integration', () => {
    const game = {
      ...baseGame,
      court: {
        ...baseGame.court!,
        club: {
          ...baseGame.court!.club!,
          integrationType: null,
          integrationConfig: null,
        },
      },
      linkedBookings: [
        {
          id: 'l1',
          externalBookingId: 'b1',
          externalBookingProvider: 'BOOKTIME',
        },
      ],
    } as Game;

    expect(evaluateGameLinkedBookingCoverage(game)).toBeNull();
    expect(resolveGameBookingBadgeKind(game)).toBe('manual');
  });
});
