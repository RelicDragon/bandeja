import type { Club } from '@/types';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import type { PadelooMyClubRow } from '@/api/padeloo';
import { booktimeBookingStartMs, booktimeIsoToUtcIso } from '@/integrations/booktime/localTime';
import { getClubTimezone } from '@/hooks/useGameTimeDuration';

export type PadelooReservationRow = {
  id: number;
  clubId: number;
  date: string;
  startTime: string;
  endTime: string;
  price?: number;
  status?: string;
};

export function reservationToBookingRecord(
  row: PadelooReservationRow,
  club: Club | PadelooMyClubRow,
): BooktimeBookingRecord {
  const tz =
    'cityTimezone' in club && club.cityTimezone
      ? club.cityTimezone
      : 'city' in club && club.city?.timezone
        ? club.city.timezone
        : getClubTimezone(club as Club);
  const startLocal = `${row.date}T${row.startTime}`;
  const endLocal = `${row.date}T${row.endTime}`;
  return {
    uuid: String(row.id),
    bookingStart: booktimeIsoToUtcIso(startLocal, tz) ?? startLocal,
    bookingEnd: booktimeIsoToUtcIso(endLocal, tz) ?? endLocal,
    price: row.price,
    status: row.status,
    bookingResourceId: undefined,
  };
}

export function isUpcomingPadelooBooking(booking: BooktimeBookingRecord, now = Date.now()): boolean {
  const startMs = booktimeBookingStartMs(booking.bookingStart);
  return Number.isFinite(startMs) && startMs >= now;
}

export function isPastPadelooBooking(booking: BooktimeBookingRecord, now = Date.now()): boolean {
  const startMs = booktimeBookingStartMs(booking.bookingStart);
  return Number.isFinite(startMs) && startMs < now;
}
