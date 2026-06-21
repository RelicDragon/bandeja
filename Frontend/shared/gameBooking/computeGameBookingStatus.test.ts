import { describe, expect, it } from 'vitest';
import { computeGameBookingStatus } from './computeGameBookingStatus';

const gameWindow = {
  startTime: '2026-06-12T10:00:00.000Z',
  endTime: '2026-06-12T12:00:00.000Z',
  maxParticipants: 4,
  playersPerMatch: 4,
  hasBookedCourt: false,
  timeIsSet: true,
  courtId: 'court-1',
  clubId: 'club-1',
};

describe('computeGameBookingStatus', () => {
  it('returns EXTERNAL_FULL when linked bookings fully cover the game', () => {
    expect(
      computeGameBookingStatus({
        ...gameWindow,
        linkedBookings: [{ bookingStart: gameWindow.startTime, bookingEnd: gameWindow.endTime }],
      }),
    ).toBe('EXTERNAL_FULL');
  });

  it('returns EXTERNAL_PARTIAL when linked bookings do not fully cover the game', () => {
    expect(
      computeGameBookingStatus({
        ...gameWindow,
        linkedBookings: [{ bookingStart: gameWindow.startTime, bookingEnd: '2026-06-12T11:00:00.000Z' }],
      }),
    ).toBe('EXTERNAL_PARTIAL');
  });

  it('returns MANUAL when hasBookedCourt is true without linked bookings', () => {
    expect(
      computeGameBookingStatus({
        ...gameWindow,
        hasBookedCourt: true,
        linkedBookings: [],
      }),
    ).toBe('MANUAL');
  });

  it('returns NONE when not booked', () => {
    expect(
      computeGameBookingStatus({
        ...gameWindow,
        linkedBookings: [],
      }),
    ).toBe('NONE');
  });
});
