import type { KlikterenMyClubRow } from '@/api/klikteren';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import { bookingMatchesClubCourts } from '@/components/booktime/booktimeBookingUtils';
import { booktimeBookingStartMs } from '@/integrations/booktime/localTime';
import { getKlikterenClient, hydrateKlikterenSession } from '@/integrations/klikteren/session';
import {
  isUpcomingKlikterenBooking,
  bookingToBookingRecord,
} from '@/integrations/klikteren/klikterenReservations';

export type AggregatedKlikterenBooking = BooktimeBookingRecord & {
  clubId: string;
  clubName: string;
  klikterenVenueId: string;
  courts: KlikterenMyClubRow['courts'];
  integrationType: 'KLIKTEREN';
};

const CACHE_TTL_MS = 5 * 60 * 1000;

const clubUpcomingCache = new Map<string, { at: number; bookings: BooktimeBookingRecord[] }>();
const clubUpcomingInFlight = new Map<string, Promise<BooktimeBookingRecord[]>>();

function isFresh(at: number, now = Date.now()): boolean {
  return now - at < CACHE_TTL_MS;
}

async function fetchUpcomingForKlikterenClub(club: KlikterenMyClubRow): Promise<BooktimeBookingRecord[]> {
  const klikterenVenueId = club.klikterenVenueId;
  if (!klikterenVenueId) return [];

  const cacheKey = club.clubId;
  const now = Date.now();
  const cached = clubUpcomingCache.get(cacheKey);
  if (cached && isFresh(cached.at, now)) {
    return cached.bookings;
  }

  const existing = clubUpcomingInFlight.get(cacheKey);
  if (existing) return existing;

  const promise = (async () => {
    await hydrateKlikterenSession(club.clubId, klikterenVenueId);
    const client = getKlikterenClient(club.clubId, klikterenVenueId);
    if (!client.isAuthenticated) return [];
    const bookings = await client.getMyBookings();
    const mapped = bookings
      .filter((row) => !row.venueId || row.venueId === klikterenVenueId)
      .map((row) => bookingToBookingRecord(row, club, klikterenVenueId))
      .filter((row) => isUpcomingKlikterenBooking(row));
    clubUpcomingCache.set(cacheKey, { at: Date.now(), bookings: mapped });
    return mapped;
  })().finally(() => {
    clubUpcomingInFlight.delete(cacheKey);
  });

  clubUpcomingInFlight.set(cacheKey, promise);
  return promise;
}

export async function loadKlikterenUpcomingForClubs(
  clubs: KlikterenMyClubRow[],
): Promise<AggregatedKlikterenBooking[]> {
  const connected = clubs.filter((club) => club.connected && club.klikterenVenueId);
  const all: AggregatedKlikterenBooking[] = [];

  for (const club of connected) {
    try {
      const rawBookings = await fetchUpcomingForKlikterenClub(club);
      for (const booking of rawBookings) {
        if (!bookingMatchesClubCourts(booking, club.courts)) continue;
        all.push({
          ...booking,
          clubId: club.clubId,
          clubName: club.clubName,
          klikterenVenueId: club.klikterenVenueId!,
          courts: club.courts,
          integrationType: 'KLIKTEREN',
        });
      }
    } catch (err) {
      console.error('Klikteren upcoming failed for club', club.clubId, err);
    }
  }

  all.sort((a, b) => booktimeBookingStartMs(a.bookingStart) - booktimeBookingStartMs(b.bookingStart));
  return all;
}

export function invalidateKlikterenUpcomingCache(): void {
  clubUpcomingCache.clear();
  clubUpcomingInFlight.clear();
}
