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

const companyUpcomingCache = new Map<
  string,
  { at: number; bookings: BooktimeBookingRecord[] }
>();
const companyUpcomingInFlight = new Map<string, Promise<BooktimeBookingRecord[]>>();

function connectedClubsKey(clubs: BooktimeMyClubRow[]): string {
  return clubs
    .filter((club) => club.connected && club.companyId)
    .map((club) => club.clubId)
    .sort()
    .join('|');
}

function groupConnectedClubsByCompany(
  connectedClubs: BooktimeMyClubRow[],
): Map<string, BooktimeMyClubRow[]> {
  const byCompany = new Map<string, BooktimeMyClubRow[]>();
  for (const club of connectedClubs) {
    const companyId = club.companyId!;
    const group = byCompany.get(companyId);
    if (group) {
      group.push(club);
    } else {
      byCompany.set(companyId, [club]);
    }
  }
  return byCompany;
}

async function fetchUpcomingForCompany(
  representativeClub: BooktimeMyClubRow,
): Promise<BooktimeBookingRecord[]> {
  const companyId = representativeClub.companyId!;
  const now = Date.now();
  const cachedCompany = companyUpcomingCache.get(companyId);
  if (cachedCompany && now - cachedCompany.at < CACHE_TTL_MS) {
    return cachedCompany.bookings;
  }

  const existing = companyUpcomingInFlight.get(companyId);
  if (existing) return existing;

  const promise = (async () => {
    const clubTimeZone = resolveBooktimeMyClubTimezone(representativeClub);
    await hydrateBooktimeSession(
      representativeClub.clubId,
      companyId,
      clubTimeZone,
    );
    const client = getBooktimeClient(
      representativeClub.clubId,
      companyId,
      clubTimeZone,
    );
    if (!client.isAuthenticated) return [];
    const res = await client.getUpcomingBookings(0, 20);
    const bookings = res.bookings ?? [];
    companyUpcomingCache.set(companyId, { at: Date.now(), bookings });
    return bookings;
  })().finally(() => {
    companyUpcomingInFlight.delete(companyId);
  });

  companyUpcomingInFlight.set(companyId, promise);
  return promise;
}

async function fetchAllBooktimeUpcoming(
  connectedClubs: BooktimeMyClubRow[],
): Promise<AggregatedBooktimeBooking[]> {
  const all: AggregatedBooktimeBooking[] = [];
  const byCompany = groupConnectedClubsByCompany(connectedClubs);

  for (const [companyId, companyClubs] of byCompany) {
    try {
      const rawBookings = await fetchUpcomingForCompany(companyClubs[0]!);
      for (const club of companyClubs) {
        for (const booking of rawBookings) {
          if (!bookingMatchesClubCourts(booking, club.courts)) continue;
          all.push({
            ...booking,
            clubId: club.clubId,
            clubName: club.clubName,
            companyId,
            courts: club.courts,
          });
        }
      }
    } catch (err) {
      for (const club of companyClubs) {
        console.error('Club booking upcoming failed for club', club.clubId, err);
      }
    }
  }

  all.sort((a, b) => booktimeBookingStartMs(a.bookingStart) - booktimeBookingStartMs(b.bookingStart));
  return all;
}

export function invalidateBooktimeAllUpcomingCache(): void {
  cached = null;
  inFlight = null;
  inFlightKey = '';
  companyUpcomingCache.clear();
  companyUpcomingInFlight.clear();
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
