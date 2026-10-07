import type { PadelooMyClubRow } from '@/api/padeloo';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import { bookingMatchesClubCourts, resolveBooktimeMyClubTimezone } from '@/components/booktime/booktimeBookingUtils';
import { booktimeBookingStartMs } from '@/integrations/booktime/localTime';
import { getPadelooClient, hydratePadelooSession } from '@/integrations/padeloo/session';
import { reportBookingMirror } from '@/features/agent/bookingMirrorSync';
import {
  isUpcomingPadelooBooking,
  reservationToBookingRecord,
} from '@/integrations/padeloo/padelooReservations';

export type AggregatedPadelooBooking = BooktimeBookingRecord & {
  clubId: string;
  clubName: string;
  padelooClubId: number;
  courts: PadelooMyClubRow['courts'];
  integrationType: 'PADELOO';
};

const CACHE_TTL_MS = 5 * 60 * 1000;

const clubUpcomingCache = new Map<string, { at: number; bookings: BooktimeBookingRecord[] }>();
const clubUpcomingInFlight = new Map<string, Promise<BooktimeBookingRecord[]>>();

/** Bumped on every clear: a fetch that started before must not write its (older) list back. */
let generation = 0;

function isFresh(at: number, now = Date.now()): boolean {
  return now - at < CACHE_TTL_MS;
}

function reservationToClubBookingRecord(
  row: Parameters<typeof reservationToBookingRecord>[0],
  club: PadelooMyClubRow,
): BooktimeBookingRecord {
  return reservationToBookingRecord(row, club);
}

async function fetchUpcomingForPadelooClub(club: PadelooMyClubRow): Promise<BooktimeBookingRecord[]> {
  const padelooClubId = club.padelooClubId;
  if (!padelooClubId) return [];

  const cacheKey = club.clubId;
  const now = Date.now();
  const cached = clubUpcomingCache.get(cacheKey);
  if (cached && isFresh(cached.at, now)) {
    return cached.bookings;
  }

  const existing = clubUpcomingInFlight.get(cacheKey);
  if (existing) return existing;

  const startedAt = generation;
  const promise = (async () => {
    await hydratePadelooSession(club.clubId, padelooClubId);
    const client = getPadelooClient(club.clubId, padelooClubId);
    if (!client.isAuthenticated) return [];
    const fetchedFrom = new Date();
    const reservations = await client.getMyReservations();
    const bookings = reservations
      .filter((row) => row.clubId === padelooClubId)
      .map((row) => reservationToClubBookingRecord(row, club))
      .filter((row) => isUpcomingPadelooBooking(row));
    if (startedAt !== generation) return bookings;
    clubUpcomingCache.set(cacheKey, { at: Date.now(), bookings });
    reportBookingMirror({
      provider: 'PADELOO',
      clubId: club.clubId,
      timeZone: resolveBooktimeMyClubTimezone(club),
      courts: club.courts,
      bookings,
      fetchedFrom,
      complete: true,
    });
    return bookings;
  })().finally(() => {
    // A clear may already have started a newer fetch under this key.
    if (clubUpcomingInFlight.get(cacheKey) === promise) clubUpcomingInFlight.delete(cacheKey);
  });

  clubUpcomingInFlight.set(cacheKey, promise);
  return promise;
}

export async function loadPadelooUpcomingForClubs(
  clubs: PadelooMyClubRow[],
): Promise<AggregatedPadelooBooking[]> {
  const connected = clubs.filter((club) => club.connected && club.padelooClubId);
  const all: AggregatedPadelooBooking[] = [];

  for (const club of connected) {
    try {
      const rawBookings = await fetchUpcomingForPadelooClub(club);
      for (const booking of rawBookings) {
        if (!bookingMatchesClubCourts(booking, club.courts)) continue;
        all.push({
          ...booking,
          clubId: club.clubId,
          clubName: club.clubName,
          padelooClubId: club.padelooClubId!,
          courts: club.courts,
          integrationType: 'PADELOO',
        });
      }
    } catch (err) {
      console.error('Padeloo upcoming failed for club', club.clubId, err);
    }
  }

  all.sort((a, b) => booktimeBookingStartMs(a.bookingStart) - booktimeBookingStartMs(b.bookingStart));
  return all;
}

export function invalidatePadelooUpcomingCache(): void {
  generation++;
  clubUpcomingCache.clear();
  clubUpcomingInFlight.clear();
}
