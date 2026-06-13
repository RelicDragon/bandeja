import type { BookingSnapshotInput } from './contracts';

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
): BookingSnapshotInput[] {
  return bookings.map((booking) => {
    const externalId = bookingResourceExternalId(booking);
    const court = findCourtByExternalId(externalId, courts);
    return {
      externalBookingId: booking.uuid,
      courtId: court?.id,
      bookingStart: booking.bookingStart,
      bookingEnd: booking.bookingEnd,
    };
  });
}
