import type { Club } from '@/types';
import type { BooktimeMyClubRow } from '@/api/booktime';
import { getClubTimezone } from '@/hooks/useGameTimeDuration';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';

export function booktimeRowToClub(row: BooktimeMyClubRow): Club {
  return {
    id: row.clubId,
    name: row.clubName,
    address: '',
    cityId: '',
    integrationType: 'BOOKTIME',
    integrationConfig: row.companyId ? { companyId: row.companyId } : null,
    courts: row.courts.map((c) => ({
      id: c.id,
      name: c.name,
      clubId: row.clubId,
      isIndoor: false,
      externalCourtId: c.externalCourtId ?? undefined,
    })),
  };
}

export function formatBooktimeBookingWhen(
  booking: BooktimeBookingRecord,
  club: Pick<Club, 'city' | 'id'> & { city?: Club['city'] }
): string {
  const tz = getClubTimezone(club as Club);
  const start = new Date(booking.bookingStart);
  const end = new Date(booking.bookingEnd);
  if (Number.isNaN(start.getTime())) return booking.bookingStart;
  const dateFmt = new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(start);
  const timeFmt = new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${dateFmt} · ${timeFmt.format(start)}–${timeFmt.format(end)}`;
}

export function resolveCourtForBooking(
  booking: BooktimeBookingRecord,
  club: BooktimeMyClubRow,
  unknownCourtLabel: string
): { courtId?: string; externalCourtId?: string; courtName: string } {
  const externalId = booking.bookingResource?.uuid;
  const court = externalId
    ? club.courts.find((c) => c.externalCourtId === externalId)
    : undefined;
  return {
    courtId: court?.id,
    externalCourtId: externalId ?? undefined,
    courtName: booking.bookingResource?.name ?? court?.name ?? unknownCourtLabel,
  };
}

export function buildCreateGameSearchParams(
  clubId: string,
  booking: BooktimeBookingRecord,
  courtId?: string
): URLSearchParams {
  const params = new URLSearchParams({
    clubId,
    hasBookedCourt: '1',
    externalBookingId: booking.uuid,
    externalBookingProvider: 'BOOKTIME',
    startTime: booking.bookingStart,
    endTime: booking.bookingEnd,
  });
  if (courtId) params.set('courtId', courtId);
  return params;
}
