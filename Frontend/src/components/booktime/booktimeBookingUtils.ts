import type { Club } from '@/types';
import type { BooktimeMyClubRow } from '@/api/booktime';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import type { ResolvedDisplaySettings } from '@/utils/displayPreferences';
import {
  formatGameTimeInTimezone,
  getDateLabelInClubTz,
  getUserTimezone,
} from '@/utils/gameTimeDisplay';

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
  options: {
    timezone?: string | null;
    displaySettings: ResolvedDisplaySettings;
    t: (key: string) => string;
  }
): string {
  const timezone = options.timezone || getUserTimezone();
  const start = new Date(booking.bookingStart);
  const end = new Date(booking.bookingEnd);
  if (Number.isNaN(start.getTime())) return booking.bookingStart;

  const dateLabel = getDateLabelInClubTz(start, timezone, options.displaySettings, options.t, {
    compactWeekday: true,
  });
  const startTime = formatGameTimeInTimezone(start, timezone, options.displaySettings);
  const endTime = formatGameTimeInTimezone(end, timezone, options.displaySettings);
  return `${dateLabel} · ${startTime} – ${endTime}`;
}

type BooktimeCourtRef = {
  id: string;
  name: string;
  externalCourtId?: string | null;
};

export function bookingResourceExternalId(booking: BooktimeBookingRecord): string | null {
  const nested = booking.bookingResource;
  for (const candidate of [booking.bookingResourceId, nested?.bookingResourceId, nested?.uuid]) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return null;
}

export function findCourtByExternalId(
  externalId: string | null | undefined,
  courts: BooktimeCourtRef[]
): BooktimeCourtRef | undefined {
  if (!externalId) return undefined;
  const trimmed = externalId.trim();
  return courts.find((c) => c.externalCourtId?.trim() === trimmed);
}

export function bookingMatchesClubCourts(
  booking: BooktimeBookingRecord,
  courts: BooktimeCourtRef[]
): boolean {
  const externalId = bookingResourceExternalId(booking);
  if (!externalId) return true;
  return !!findCourtByExternalId(externalId, courts);
}

export function resolveCourtForBooking(
  booking: BooktimeBookingRecord,
  club: BooktimeMyClubRow,
  unknownCourtLabel: string
): { courtId?: string; externalCourtId?: string; courtName: string } {
  const externalId = bookingResourceExternalId(booking);
  const court = findCourtByExternalId(externalId, club.courts);
  return {
    courtId: court?.id,
    externalCourtId: externalId ?? undefined,
    courtName: court?.name ?? booking.bookingResource?.name ?? unknownCourtLabel,
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
