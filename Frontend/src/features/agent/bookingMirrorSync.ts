/**
 * Booking-list mirror sync (AI agent booking slice 7k, docs/domains/agent.md "Booking-list
 * mirror"). After the app loads the user's own upcoming Booktime / Padeloo / Klikteren list for
 * a club from the provider, it PUTs that list to `/api/bookings/mirror` so the assistant and
 * Telegram can list and link those bookings (the backend never calls these providers).
 *
 * Fire-and-forget, no UI: debounced per (user, provider, club), and at most one send per key
 * every ~2 min. Only called with a list the provider actually returned (never for a failed or
 * signed-out fetch: an empty list here means "no bookings" and removes mirror rows).
 */
import api from '@/api/axios';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import {
  bookingMatchesClubCourts,
  bookingResourceExternalId,
  findCourtByExternalId,
} from '@/components/booktime/booktimeBookingUtils';
import { parseBooktimeStoredOrNaiveToDate } from '@/integrations/booktime/localTime';
import { useAuthStore } from '@/store/authStore';

export type BookingMirrorProvider = 'BOOKTIME' | 'PADELOO' | 'KLIKTEREN';

type MirrorCourtRef = {
  id: string;
  name: string;
  externalCourtId?: string | null;
  integrationCourtName?: string | null;
};

export type BookingMirrorReport = {
  provider: BookingMirrorProvider;
  clubId: string;
  /** The club's city timezone (Booktime-style records may carry naive local times). */
  timeZone: string;
  courts: MirrorCourtRef[];
  /** The provider's upcoming list for this club, as fetched (unfiltered by court is fine). */
  bookings: BooktimeBookingRecord[];
  /** When the fetch started: the list is complete from here on. */
  fetchedFrom: Date;
  /** false when the provider returned only a first page. */
  complete: boolean;
};

export type BookingMirrorBody = {
  provider: BookingMirrorProvider;
  clubId: string;
  rangeFrom: string;
  rangeTo: string;
  complete: boolean;
  bookings: {
    externalBookingId: string;
    start: string;
    end: string;
    courts: { courtId: string | null; name: string | null }[];
    state: 'CONFIRMED' | 'CANCELLED';
  }[];
};

export const BOOKING_MIRROR_MIN_INTERVAL_MS = 2 * 60 * 1000;
export const BOOKING_MIRROR_DEBOUNCE_MS = 1500;
const MAX_BOOKINGS = 100;
const RANGE_MS = 365 * 24 * 60 * 60 * 1000;
const MAX_BOOKING_MS = 24 * 60 * 60 * 1000;

/** Server body for one report (pure). Truncated lists shrink `rangeTo` to what was seen. */
export function toBookingMirrorBody(report: BookingMirrorReport): BookingMirrorBody {
  const rows = report.bookings
    .filter((booking) => booking.uuid && bookingMatchesClubCourts(booking, report.courts))
    .flatMap((booking) => {
      const start = parseBooktimeStoredOrNaiveToDate(booking.bookingStart, report.timeZone);
      const end = parseBooktimeStoredOrNaiveToDate(booking.bookingEnd, report.timeZone);
      if (!start || !end) return [];
      const length = end.getTime() - start.getTime();
      if (length <= 0 || length > MAX_BOOKING_MS) return [];
      const court = findCourtByExternalId(bookingResourceExternalId(booking), report.courts);
      const name = (court?.name ?? booking.bookingResource?.name ?? '').trim().slice(0, 80);
      return [{
        externalBookingId: String(booking.uuid).slice(0, 128),
        start,
        end,
        courts: court || name ? [{ courtId: court?.id ?? null, name: name || null }] : [],
        state: /cancel/i.test(booking.status ?? '') ? ('CANCELLED' as const) : ('CONFIRMED' as const),
      }];
    })
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const kept = rows.slice(0, MAX_BOOKINGS);
  const truncated = !report.complete || rows.length > MAX_BOOKINGS;
  const rangeFrom = report.fetchedFrom;
  const lastStart = kept.length > 0 ? kept[kept.length - 1].start.getTime() : null;
  const rangeTo =
    truncated && lastStart !== null && lastStart > rangeFrom.getTime()
      ? new Date(lastStart)
      : new Date(rangeFrom.getTime() + RANGE_MS);
  return {
    provider: report.provider,
    clubId: report.clubId,
    rangeFrom: rangeFrom.toISOString(),
    rangeTo: rangeTo.toISOString(),
    complete: !truncated,
    bookings: kept.map((row) => ({ ...row, start: row.start.toISOString(), end: row.end.toISOString() })),
  };
}

type SyncerDeps = {
  send: (body: BookingMirrorBody) => Promise<unknown>;
  currentUserId: () => string | null | undefined;
  now?: () => number;
  debounceMs?: number;
  minIntervalMs?: number;
};

/** Debounced, rate-limited sender (injectable for tests). */
export function createBookingMirrorSyncer(deps: SyncerDeps) {
  const now = deps.now ?? Date.now;
  const debounceMs = deps.debounceMs ?? BOOKING_MIRROR_DEBOUNCE_MS;
  const minIntervalMs = deps.minIntervalMs ?? BOOKING_MIRROR_MIN_INTERVAL_MS;
  const pending = new Map<string, { timer: ReturnType<typeof setTimeout>; report: BookingMirrorReport }>();
  const lastSentAt = new Map<string, number>();

  const flush = (key: string) => {
    const entry = pending.get(key);
    pending.delete(key);
    if (!entry) return;
    const last = lastSentAt.get(key);
    if (last !== undefined && now() - last < minIntervalMs) return;
    lastSentAt.set(key, now());
    deps.send(toBookingMirrorBody(entry.report)).catch(() => {
      // Best effort: a failed sync only leaves the assistant's list older. Retry on a later load.
      lastSentAt.delete(key);
    });
  };

  return {
    report(report: BookingMirrorReport): void {
      const userId = deps.currentUserId();
      if (!userId || !report.clubId) return;
      const key = `${userId}:${report.provider}:${report.clubId}`;
      const last = lastSentAt.get(key);
      if (last !== undefined && now() - last < minIntervalMs) return;
      const existing = pending.get(key);
      if (existing) clearTimeout(existing.timer);
      pending.set(key, { report, timer: setTimeout(() => flush(key), debounceMs) });
    },
    reset(): void {
      for (const entry of pending.values()) clearTimeout(entry.timer);
      pending.clear();
      lastSentAt.clear();
    },
  };
}

const defaultSyncer = createBookingMirrorSyncer({
  send: (body) => api.put('/bookings/mirror', body),
  currentUserId: () => useAuthStore.getState().user?.id,
});

/** Called by the provider list loaders after a successful fetch. Never throws. */
export function reportBookingMirror(report: BookingMirrorReport): void {
  try {
    defaultSyncer.report(report);
  } catch {
    // Never let the mirror break the booking list itself.
  }
}
