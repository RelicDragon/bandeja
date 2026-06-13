import { describe, expect, it } from 'vitest';
import { deriveGameTimeFromBookings } from './deriveGameTimeFromBookings';

describe('deriveGameTimeFromBookings', () => {
  it('returns min start and max end across snapshots', () => {
    expect(
      deriveGameTimeFromBookings([
        { bookingStart: '2026-06-12T10:00:00.000Z', bookingEnd: '2026-06-12T11:00:00.000Z' },
        { bookingStart: '2026-06-12T09:00:00.000Z', bookingEnd: '2026-06-12T12:00:00.000Z' },
      ]),
    ).toEqual({
      startTime: '2026-06-12T09:00:00.000Z',
      endTime: '2026-06-12T12:00:00.000Z',
    });
  });

  it('returns nulls when no valid times', () => {
    expect(deriveGameTimeFromBookings([])).toEqual({ startTime: null, endTime: null });
    expect(deriveGameTimeFromBookings([{ bookingStart: '2026-06-12T10:00:00.000Z' }])).toEqual({
      startTime: null,
      endTime: null,
    });
  });
});
