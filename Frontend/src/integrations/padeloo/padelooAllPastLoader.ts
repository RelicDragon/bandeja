import type { PadelooMyClubRow } from '@/api/padeloo';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import { bookingMatchesClubCourts } from '@/components/booktime/booktimeBookingUtils';
import { booktimeBookingStartMs } from '@/integrations/booktime/localTime';
import { getPadelooClient, hydratePadelooSession } from '@/integrations/padeloo/session';
import {
  isPastPadelooBooking,
  reservationToBookingRecord,
} from '@/integrations/padeloo/padelooReservations';

export type AggregatedPadelooPastBooking = BooktimeBookingRecord & {
  clubId: string;
  clubName: string;
  padelooClubId: number;
  courts: PadelooMyClubRow['courts'];
  integrationType: 'PADELOO';
};

export async function loadPadelooPastForClubs(
  clubs: PadelooMyClubRow[],
  limitPerClub = 20,
): Promise<AggregatedPadelooPastBooking[]> {
  const connected = clubs.filter((club) => club.connected && club.padelooClubId);
  const all: AggregatedPadelooPastBooking[] = [];

  for (const club of connected) {
    const padelooClubId = club.padelooClubId!;
    try {
      await hydratePadelooSession(club.clubId, padelooClubId);
      const client = getPadelooClient(club.clubId, padelooClubId);
      if (!client.isAuthenticated) continue;
      const reservations = await client.getMyReservations();
      const past = reservations
        .filter((row) => row.clubId === padelooClubId)
        .map((row) => reservationToBookingRecord(row, club))
        .filter((row) => isPastPadelooBooking(row))
        .slice(0, limitPerClub);
      for (const booking of past) {
        if (!bookingMatchesClubCourts(booking, club.courts)) continue;
        all.push({
          ...booking,
          clubId: club.clubId,
          clubName: club.clubName,
          padelooClubId,
          courts: club.courts,
          integrationType: 'PADELOO',
        });
      }
    } catch (err) {
      console.error('Padeloo past failed for club', club.clubId, err);
    }
  }

  all.sort((a, b) => booktimeBookingStartMs(b.bookingStart) - booktimeBookingStartMs(a.bookingStart));
  return all;
}
