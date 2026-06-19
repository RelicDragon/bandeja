import { del, get, set } from 'idb-keyval';
import type { BooktimeMyClubRow } from '@/api/booktime';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';

const STORAGE_KEY = 'booktime-all-upcoming-cache-v1';

export type PersistedAggregatedBooktimeBooking = BooktimeBookingRecord & {
  clubId: string;
  clubName: string;
  companyId: string;
  courts: BooktimeMyClubRow['courts'];
};

export type PersistedBooktimeUpcomingCache = {
  v: 1;
  aggregated: { key: string; bookings: PersistedAggregatedBooktimeBooking[]; at: number } | null;
  companies: Record<string, { at: number; bookings: BooktimeBookingRecord[] }>;
};

export async function readBooktimeUpcomingPersistedCache(): Promise<PersistedBooktimeUpcomingCache | null> {
  try {
    const stored = await get<PersistedBooktimeUpcomingCache>(STORAGE_KEY);
    if (!stored || stored.v !== 1) return null;
    return stored;
  } catch {
    return null;
  }
}

export async function writeBooktimeUpcomingPersistedCache(
  payload: PersistedBooktimeUpcomingCache,
): Promise<void> {
  try {
    await set(STORAGE_KEY, payload);
  } catch {
    // ignore quota / private mode
  }
}

export async function clearBooktimeUpcomingPersistedCache(): Promise<void> {
  try {
    await del(STORAGE_KEY);
  } catch {
    // ignore
  }
}
