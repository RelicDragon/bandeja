import type { BooktimeMyClubRow } from '@/api/booktime';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import { bookingMatchesClubCourts, resolveBooktimeMyClubTimezone } from '@/components/booktime/booktimeBookingUtils';
import { booktimeBookingStartMs } from '@/integrations/booktime/localTime';
import { getBooktimeClient, hydrateBooktimeSession } from '@/integrations/booktime/session';

export type AggregatedBooktimeBooking = BooktimeBookingRecord & {
  clubId: string;
  clubName: string;
  companyId: string;
  courts: BooktimeMyClubRow['courts'];
};

const CACHE_TTL_MS = 15_000;

let inFlight: Promise<AggregatedBooktimeBooking[]> | null = null;
let inFlightKey = '';
let cached: { key: string; bookings: AggregatedBooktimeBooking[]; at: number } | null = null;

function connectedClubsKey(clubs: BooktimeMyClubRow[]): string {
  return clubs
    .filter((club) => club.connected && club.companyId)
    .map((club) => club.clubId)
    .sort()
    .join('|');
}

async function fetchAllBooktimeUpcoming(
  connectedClubs: BooktimeMyClubRow[],
): Promise<AggregatedBooktimeBooking[]> {
  const all: AggregatedBooktimeBooking[] = [];
  for (const club of connectedClubs) {
    try {
      const clubTimeZone = resolveBooktimeMyClubTimezone(club);
      await hydrateBooktimeSession(club.clubId, club.companyId!, clubTimeZone);
      const client = getBooktimeClient(club.clubId, club.companyId!, clubTimeZone);
      if (!client.isAuthenticated) continue;
      const res = await client.getUpcomingBookings(0, 20);
      for (const booking of res.bookings ?? []) {
        if (!bookingMatchesClubCourts(booking, club.courts)) continue;
        all.push({
          ...booking,
          clubId: club.clubId,
          clubName: club.clubName,
          companyId: club.companyId!,
          courts: club.courts,
        });
      }
    } catch (err) {
      console.error('Club booking upcoming failed for club', club.clubId, err);
    }
  }
  all.sort((a, b) => booktimeBookingStartMs(a.bookingStart) - booktimeBookingStartMs(b.bookingStart));
  return all;
}

export function invalidateBooktimeAllUpcomingCache(): void {
  cached = null;
  inFlight = null;
  inFlightKey = '';
}

export async function loadAllBooktimeUpcoming(
  clubs: BooktimeMyClubRow[],
  enabled: boolean,
): Promise<AggregatedBooktimeBooking[]> {
  if (!enabled) return [];

  const connectedClubs = clubs.filter((club) => club.connected && club.companyId);
  if (connectedClubs.length === 0) return [];

  const key = connectedClubsKey(connectedClubs);
  const now = Date.now();
  if (cached && cached.key === key && now - cached.at < CACHE_TTL_MS) {
    return cached.bookings;
  }

  if (inFlight && inFlightKey === key) {
    return inFlight;
  }

  inFlightKey = key;
  inFlight = fetchAllBooktimeUpcoming(connectedClubs)
    .then((bookings) => {
      cached = { key, bookings, at: Date.now() };
      return bookings;
    })
    .finally(() => {
      inFlight = null;
      inFlightKey = '';
    });

  return inFlight;
}
