import { booktimeIngestToStoredUtcIso } from '../booktime/localTime';
import type { BookingSnapshotInput } from './contracts';

export type BuildBookingSnapshotsOptions = {
  timeZone?: string;
};

type CourtRef = {
  id: string;
  externalCourtId?: string | null;
};

type BookingLike = {
  uuid: string;
  bookingStart: string;
  bookingEnd: string;
  bookingResource?: { id?: string; bookingResourceId?: string; uuid?: string };
  bookingResourceId?: string;
};

function bookingResourceExternalId(booking: BookingLike): string | null {
  const nested = booking.bookingResource;
  for (const candidate of [booking.bookingResourceId, nested?.bookingResourceId, nested?.uuid, nested?.id]) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return null;
}

function findCourtByExternalId(externalId: string | null, courts: CourtRef[]): CourtRef | undefined {
  if (!externalId) return undefined;
  return courts.find((c) => c.externalCourtId?.trim() === externalId);
}

export function buildBookingSnapshots(
  bookings: BookingLike[],
  courts: CourtRef[],
  options?: BuildBookingSnapshotsOptions,
): BookingSnapshotInput[] {
  const timeZone = options?.timeZone;
  return bookings.map((booking) => {
    const externalId = bookingResourceExternalId(booking);
    const court = findCourtByExternalId(externalId, courts);
    const bookingStart = timeZone
      ? booktimeIngestToStoredUtcIso(booking.bookingStart, timeZone) ?? booking.bookingStart
      : booking.bookingStart;
    const bookingEnd = timeZone
      ? booktimeIngestToStoredUtcIso(booking.bookingEnd, timeZone) ?? booking.bookingEnd
      : booking.bookingEnd;
    return {
      externalBookingId: booking.uuid,
      courtId: court?.id,
      bookingStart,
      bookingEnd,
    };
  });
}
