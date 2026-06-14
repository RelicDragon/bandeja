import type { Club } from '@/types';
import type { BooktimeMyClubRow } from '@/api/booktime';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import { BOOKTIME_DEFAULT_TIMEZONE, storedUtcIsoToInstant } from '@shared/booktime/localTime';
import { buildCreateGameDeepLinkParams } from '@shared/gameBooking/linkBookingToGame';
import type { ResolvedDisplaySettings } from '@/utils/displayPreferences';

export function linkedBookingToRecord(link: {
  externalBookingId: string;
  bookingStart?: string;
  bookingEnd?: string;
}): BooktimeBookingRecord {
  return {
    uuid: link.externalBookingId,
    bookingStart: link.bookingStart ?? '',
    bookingEnd: link.bookingEnd ?? '',
  };
}

export function clubToBooktimeRow(club: Club): BooktimeMyClubRow {
  return {
    clubId: club.id,
    clubName: club.name,
    avatar: club.avatar ?? null,
    companyId: club.integrationConfig?.companyId ?? null,
    connected: true,
    phoneNumber: club.phone ?? null,
    scoutOptIn: false,
    courts: (club.courts ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      externalCourtId: c.externalCourtId ?? null,
      integrationCourtName: c.integrationCourtName ?? null,
    })),
  };
}

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
      integrationCourtName: c.integrationCourtName ?? undefined,
    })),
  };
}

function formatBooktimeWallClock(
  date: Date,
  timezone: string,
  displaySettings: ResolvedDisplaySettings
): string {
  return new Intl.DateTimeFormat(displaySettings.locale, {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: displaySettings.hour12,
  }).format(date);
}

export function formatBooktimeBookingWhen(
  booking: BooktimeBookingRecord,
  options: {
    timezone?: string | null;
    displaySettings: ResolvedDisplaySettings;
  }
): string {
  const timezone = options.timezone ?? BOOKTIME_DEFAULT_TIMEZONE;
  const startDate = storedUtcIsoToInstant(booking.bookingStart);
  if (!startDate) return booking.bookingStart;

  const endDate = booking.bookingEnd
    ? storedUtcIsoToInstant(booking.bookingEnd)
    : null;

  const dateLabel = new Intl.DateTimeFormat(options.displaySettings.locale, {
    timeZone: timezone,
    dateStyle: 'long',
  }).format(startDate);
  const startTime = formatBooktimeWallClock(startDate, timezone, options.displaySettings);
  const endTime = endDate
    ? formatBooktimeWallClock(endDate, timezone, options.displaySettings)
    : null;
  return endTime ? `${dateLabel} · ${startTime} – ${endTime}` : `${dateLabel} · ${startTime}`;
}

export function formatBooktimeBookingDate(
  booking: BooktimeBookingRecord,
  options: {
    timezone?: string | null;
    displaySettings: ResolvedDisplaySettings;
  }
): string {
  const timezone = options.timezone ?? BOOKTIME_DEFAULT_TIMEZONE;
  const startDate = storedUtcIsoToInstant(booking.bookingStart);
  if (!startDate) return booking.bookingStart;

  return new Intl.DateTimeFormat(options.displaySettings.locale, {
    timeZone: timezone,
    dateStyle: 'long',
  }).format(startDate);
}

export function formatBooktimeBookingSlotRange(
  booking: BooktimeBookingRecord,
  options: {
    timezone?: string | null;
    displaySettings: ResolvedDisplaySettings;
  }
): string {
  const timezone = options.timezone ?? BOOKTIME_DEFAULT_TIMEZONE;
  const startDate = storedUtcIsoToInstant(booking.bookingStart);
  if (!startDate) return booking.bookingStart;

  const endDate = booking.bookingEnd ? storedUtcIsoToInstant(booking.bookingEnd) : null;
  const startTime = formatBooktimeWallClock(startDate, timezone, options.displaySettings);
  const endTime = endDate ? formatBooktimeWallClock(endDate, timezone, options.displaySettings) : null;
  return endTime ? `${startTime} – ${endTime}` : startTime;
}

type BooktimeCourtRef = {
  id: string;
  name: string;
  externalCourtId?: string | null;
  integrationCourtName?: string | null;
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
): {
  courtId?: string;
  externalCourtId?: string;
  courtName: string;
  integrationCourtName: string | null;
} {
  const externalId = bookingResourceExternalId(booking);
  const court = findCourtByExternalId(externalId, club.courts);
  const integrationCourtName =
    court?.integrationCourtName ?? booking.bookingResource?.name ?? null;
  return {
    courtId: court?.id,
    externalCourtId: externalId ?? undefined,
    courtName: court?.name ?? booking.bookingResource?.name ?? unknownCourtLabel,
    integrationCourtName,
  };
}

export function buildCreateGameSearchParams(
  clubId: string,
  booking: BooktimeBookingRecord,
  courtId?: string,
  timeZone?: string | null,
): URLSearchParams {
  return new URLSearchParams(buildCreateGameDeepLinkParams(clubId, booking, courtId, timeZone));
}
