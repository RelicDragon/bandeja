import { describe, expect, it } from 'vitest';
import { gameLinkedBookingIdsNeedingAttention } from './gameHasConfirmedClubBooking';
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
