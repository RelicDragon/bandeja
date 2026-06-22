import { describe, expect, it } from 'vitest';
import { booktimeIngestToStoredUtcIso } from '../booktime/localTime';
import {
  bookingWallClockIntervalMinutes,
  mapBookingsToTimeGridCells,
  slotOverlapsBookingInterval,
} from './mapBookingsToTimeGridCells';

const TZ = 'Europe/Belgrade';

function booking(start: string, end: string, uuid = 'b1') {
  return {
    uuid,
    bookingStart: booktimeIngestToStoredUtcIso(start, TZ)!,
    bookingEnd: booktimeIngestToStoredUtcIso(end, TZ)!,
  };
}

function bookingStored(start: string, end: string, uuid = 'b1') {
  return { uuid, bookingStart: start, bookingEnd: end };
}

describe('mapBookingsToTimeGridCells', () => {
  it('maps a two-hour booking to four 30-minute cells in club timezone', () => {
    const gridTimes = ['18:00', '18:30', '19:00', '19:30', '20:00'];
    const map = mapBookingsToTimeGridCells({
      bookings: [booking('2026-06-15T18:00:00.000Z', '2026-06-15T20:00:00.000Z')],
      gridTimes,
      timeZone: TZ,
    });

    expect(map['18:00']?.hasReservation).toBe(true);
    expect(map['18:30']?.hasReservation).toBe(true);
    expect(map['19:00']?.hasReservation).toBe(true);
    expect(map['19:30']?.hasReservation).toBe(true);
    expect(map['20:00']?.hasReservation).toBe(false);
    expect(map['18:00']?.coveringBookingIds).toEqual(['b1']);
  });

  it('marks selected reservation cells distinctly', () => {
    const gridTimes = ['18:00', '18:30', '19:00'];
    const map = mapBookingsToTimeGridCells({
      bookings: [booking('2026-06-15T18:00:00.000Z', '2026-06-15T19:00:00.000Z')],
      gridTimes,
      timeZone: TZ,
      selectedBookingIds: ['b1'],
    });

    expect(map['18:00']?.hasSelectedReservation).toBe(true);
    expect(map['18:30']?.hasSelectedReservation).toBe(true);
    expect(map['19:00']?.hasSelectedReservation).toBe(false);
  });

  it('flags ambiguous cells when multiple courts share the same slot', () => {
    const gridTimes = ['10:00'];
    const map = mapBookingsToTimeGridCells({
      bookings: [
        booking('2026-06-15T10:00:00.000Z', '2026-06-15T11:00:00.000Z', 'court-a'),
        booking('2026-06-15T10:00:00.000Z', '2026-06-15T11:00:00.000Z', 'court-b'),
      ],
      gridTimes,
      timeZone: TZ,
    });

    expect(map['10:00']?.isAmbiguous).toBe(true);
    expect(map['10:00']?.coveringBookingIds).toEqual(['court-a', 'court-b']);
  });

  it('handles partial slot overlap at booking boundaries', () => {
    expect(
      slotOverlapsBookingInterval(
        10 * 60,
        10 * 60 + 30,
        10 * 60 + 15,
        10 * 60 + 45,
      ),
    ).toBe(true);
    expect(
      slotOverlapsBookingInterval(
        10 * 60,
        10 * 60 + 30,
        10 * 60 + 30,
        11 * 60,
      ),
    ).toBe(false);
  });

  it('extends end past midnight when end wall clock is before start', () => {
    const interval = bookingWallClockIntervalMinutes(
      bookingStored('2026-06-15T21:00:00.000Z', '2026-06-15T22:30:00.000Z'),
      TZ,
    );
    expect(interval).not.toBeNull();
    expect(interval!.startMinutes).toBe(23 * 60);
    expect(interval!.endMinutes).toBe(24 * 60 + 30);
  });

  it('returns empty reservation state for slots outside booking window', () => {
    const gridTimes = ['08:00', '09:00'];
    const map = mapBookingsToTimeGridCells({
      bookings: [booking('2026-06-15T18:00:00.000Z', '2026-06-15T19:00:00.000Z')],
      gridTimes,
      timeZone: TZ,
    });

    expect(map['08:00']?.hasReservation).toBe(false);
    expect(map['09:00']?.coveringBookingIds).toEqual([]);
  });

  it('respects custom slot minutes', () => {
    const gridTimes = ['10:00', '10:15', '10:30'];
    const map = mapBookingsToTimeGridCells({
      bookings: [booking('2026-06-15T10:00:00.000Z', '2026-06-15T10:30:00.000Z')],
      gridTimes,
      timeZone: TZ,
      slotMinutes: 15,
    });

    expect(map['10:00']?.hasReservation).toBe(true);
    expect(map['10:15']?.hasReservation).toBe(true);
    expect(map['10:30']?.hasReservation).toBe(false);
  });
});
