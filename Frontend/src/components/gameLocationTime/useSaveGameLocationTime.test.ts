import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Club, Court, Game } from '@/types';
import {
  buildEditLocationTimeSaveDraft,
  saveLocationTime,
} from './useSaveGameLocationTime';

const apiMocks = vi.hoisted(() => ({
  gamesUpdateMock: vi.fn(),
  gamesGetByIdMock: vi.fn(),
  gamesPatchBookingsMock: vi.fn(),
  gamesPutBookingSnapshotsMock: vi.fn(),
  setGameCourtsMock: vi.fn(),
}));

vi.mock('@/api/games', () => ({
  gamesApi: {
    update: apiMocks.gamesUpdateMock,
    getById: apiMocks.gamesGetByIdMock,
    patchBookings: apiMocks.gamesPatchBookingsMock,
    putBookingSnapshots: apiMocks.gamesPutBookingSnapshotsMock,
  },
}));

vi.mock('@/api/gameCourts', () => ({
  gameCourtsApi: {
    setGameCourts: apiMocks.setGameCourtsMock,
  },
}));

vi.mock('@/services/gameBooking/linkBookingToGame', () => ({
  linkBookingToGame: vi.fn(),
}));

const club = {
  id: 'club-1',
  name: 'Club One',
  address: 'Address',
  cityId: 'city-1',
  city: { timezone: 'Europe/Belgrade' },
} as Club;

const court = {
  id: 'court-1',
  name: 'Court 1',
  clubId: 'club-1',
  isIndoor: false,
  externalCourtId: 'external-court-1',
} as Court;

const game = {
  id: 'game-1',
  entityType: 'GAME',
  gameType: 'CLASSIC',
  clubId: 'club-1',
  courtId: 'court-1',
  startTime: '2026-06-19T07:00:00.000Z',
  endTime: '2026-06-19T08:00:00.000Z',
  maxParticipants: 4,
  minParticipants: 4,
  isPublic: true,
  affectsRating: true,
  allowDirectJoin: true,
  hasBookedCourt: true,
  status: 'ANNOUNCED',
  resultsStatus: 'NONE',
  participants: [],
  city: { id: 'city-1' },
  linkedBookings: [
    {
      id: 'link-1',
      externalBookingId: 'booking-1',
      externalBookingProvider: 'BOOKTIME',
      courtId: 'court-1',
      bookingStart: '2026-06-19T07:00:00.000Z',
      bookingEnd: '2026-06-19T08:00:00.000Z',
    },
  ],
  gameCourts: [
    {
      id: 'game-court-1',
      gameId: 'game-1',
      courtId: 'court-1',
      order: 1,
      court,
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    },
  ],
} as Game;

describe('buildEditLocationTimeSaveDraft', () => {
  it('unlinks previous external bookings and clears courts when the edit selection is empty', () => {
    const draft = buildEditLocationTimeSaveDraft({
      game,
      clubId: 'club-1',
      courtId: '',
      selectedCourtIds: [],
      whenSelectedDate: new Date('2026-06-19T00:00:00.000Z'),
      whenSelectedTime: '09:00',
      whenDuration: 1,
      hasBookedCourt: false,
      club,
      courts: [court],
      pendingRemoveBookingIds: [],
      locationTimeDraft: {
        locationTimeMode: 'timeSlots',
        selectedBookingIds: [],
        selectedBookingRecords: [],
        timeOverride: false,
        willBookOnCreate: false,
        integratedCourtIds: [],
      },
    });

    expect(draft.removeBookingIds).toEqual(['booking-1']);
    expect(draft.courtId).toBe('');
    expect(draft.courtIds).toEqual([]);
    expect(draft.hasBookedCourt).toBe(false);
  });

  it('unlinks the previous booking when the edit picker switches to a new reservation', () => {
    const draft = buildEditLocationTimeSaveDraft({
      game,
      clubId: 'club-1',
      courtId: 'court-1',
      selectedCourtIds: ['court-1'],
      whenSelectedDate: new Date('2026-06-19T00:00:00.000Z'),
      whenSelectedTime: '09:00',
      whenDuration: 1,
      hasBookedCourt: true,
      club,
      courts: [court],
      pendingRemoveBookingIds: [],
      locationTimeDraft: {
        locationTimeMode: 'bookings',
        selectedBookingIds: ['booking-2'],
        selectedBookingRecords: [
          {
            uuid: 'booking-2',
            bookingStart: '2026-06-19T08:00:00.000Z',
            bookingEnd: '2026-06-19T09:00:00.000Z',
          },
        ],
        timeOverride: false,
        willBookOnCreate: false,
        integratedCourtIds: [],
      },
    });

    expect(draft.removeBookingIds).toEqual(['booking-1']);
    expect(draft.linkBookingContext?.adds.map((add) => add.booking.uuid)).toEqual(['booking-2']);
  });

  it('unlinks the previous booking when edit save books a new court reservation', () => {
    const draft = buildEditLocationTimeSaveDraft({
      game,
      clubId: 'club-1',
      courtId: 'court-1',
      selectedCourtIds: ['court-1'],
      whenSelectedDate: new Date('2026-06-19T00:00:00.000Z'),
      whenSelectedTime: '10:00',
      whenDuration: 1,
      hasBookedCourt: true,
      club,
      courts: [court],
      pendingRemoveBookingIds: [],
      locationTimeDraft: {
        locationTimeMode: 'timeSlots',
        selectedBookingIds: ['booking-1'],
        selectedBookingRecords: [],
        timeOverride: false,
        willBookOnCreate: true,
        integratedCourtIds: ['court-1'],
      },
      bookingOverrides: {
        externalBookingIds: ['booking-2'],
        bookingSnapshots: [
          {
            externalBookingId: 'booking-2',
            courtId: 'court-1',
            bookingStart: '2026-06-19T08:00:00.000Z',
            bookingEnd: '2026-06-19T09:00:00.000Z',
          },
        ],
      },
    });

    expect(draft.removeBookingIds).toEqual(['booking-1']);
    expect(draft.linkBookingContext?.adds.map((add) => add.booking.uuid)).toEqual(['booking-2']);
  });
});

describe('saveLocationTime', () => {
  beforeEach(() => {
    apiMocks.gamesUpdateMock.mockReset();
    apiMocks.gamesGetByIdMock.mockReset().mockResolvedValue({ data: game });
    apiMocks.gamesPatchBookingsMock.mockReset();
    apiMocks.gamesPutBookingSnapshotsMock.mockReset();
    apiMocks.setGameCourtsMock.mockReset();
  });

  it('sends explicit court clears to the game and game-courts APIs', async () => {
    await saveLocationTime('game-1', {
      clubId: 'club-1',
      courtId: '',
      courtIds: [],
      hasBookedCourt: false,
      addBookingIds: [],
      removeBookingIds: [],
    });

    expect(apiMocks.gamesUpdateMock).toHaveBeenCalledWith('game-1', {
      clubId: 'club-1',
      courtId: '',
      hasBookedCourt: false,
    });
    expect(apiMocks.setGameCourtsMock).toHaveBeenCalledWith('game-1', []);
  });

  it('removes old bookings before adding replacements', async () => {
    const calls: string[] = [];
    apiMocks.gamesPatchBookingsMock.mockImplementation(async (_id, body) => {
      if (body.remove) calls.push(`remove:${body.remove.join(',')}`);
      if (body.add) calls.push(`add:${body.add.join(',')}`);
      return { data: game };
    });

    await saveLocationTime('game-1', {
      addBookingIds: ['booking-2'],
      removeBookingIds: ['booking-1'],
    });

    expect(calls).toEqual(['remove:booking-1', 'add:booking-2']);
  });
});
