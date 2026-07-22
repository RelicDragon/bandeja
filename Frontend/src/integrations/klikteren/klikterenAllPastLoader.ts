import type { KlikterenMyClubRow } from '@/api/klikteren';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import { bookingMatchesClubCourts } from '@/components/booktime/booktimeBookingUtils';
import { booktimeBookingStartMs } from '@/integrations/booktime/localTime';
import { getKlikterenClient, hydrateKlikterenSession } from '@/integrations/klikteren/session';
import {
  isPastKlikterenBooking,
  bookingToBookingRecord,
} from '@/integrations/klikteren/klikterenReservations';

export type AggregatedKlikterenPastBooking = BooktimeBookingRecord & {
  clubId: string;
  clubName: string;
  klikterenVenueId: string;
  courts: KlikterenMyClubRow['courts'];
  integrationType: 'KLIKTEREN';
};

export async function loadKlikterenPastForClubs(
  clubs: KlikterenMyClubRow[],
  limitPerClub = 20,
): Promise<AggregatedKlikterenPastBooking[]> {
  const connected = clubs.filter((club) => club.connected && club.klikterenVenueId);
  const all: AggregatedKlikterenPastBooking[] = [];

  for (const club of connected) {
    const klikterenVenueId = club.klikterenVenueId!;
    try {
      await hydrateKlikterenSession(club.clubId, klikterenVenueId);
      const client = getKlikterenClient(club.clubId, klikterenVenueId);
      if (!client.isAuthenticated) continue;
      const bookings = await client.getMyBookings();
      const past = bookings
        .filter((row) => !row.venueId || row.venueId === klikterenVenueId)
        .map((row) => bookingToBookingRecord(row, club, klikterenVenueId))
        .filter((row) => isPastKlikterenBooking(row))
        .slice(0, limitPerClub);
      for (const booking of past) {
        if (!bookingMatchesClubCourts(booking, club.courts)) continue;
        all.push({
          ...booking,
          clubId: club.clubId,
          clubName: club.clubName,
          klikterenVenueId,
          courts: club.courts,
          integrationType: 'KLIKTEREN',
        });
      }
    } catch (err) {
      console.error('Klikteren past failed for club', club.clubId, err);
    }
  }

  all.sort((a, b) => booktimeBookingStartMs(b.bookingStart) - booktimeBookingStartMs(a.bookingStart));
  return all;
}
