/**
 * Club admin console reads. Every query passes the AbortSignal through, never retries a 4xx,
 * and degrades to the legacy endpoint when a v2 one is not deployed yet (bare 404).
 */
import { useInfiniteQuery, useQueries, useQuery, type QueryClient } from '@tanstack/react-query';
import type { BookingItem, ClubDashboard } from '@shared/clubAdmin/contract';
import { clubAdminApi, type ClubAdminClubListItem } from '@/api/clubAdmin';
import { isEndpointMissing, parseClubAdminError } from '@/api/clubAdminErrors';
import { bookingsFilterKey, clubAdminKeys, type BookingsFilters } from './keys';
import { legacyClubInfo, legacyContextFromClub, type ConsoleContext, type LegacyClubInfo } from './legacyContext';
import { matchesBookingFilters, reservationToBooking } from './legacyBookings';
import { SCHEDULE_POLL_MS, schedulePollInterval } from './pollInterval';

const CLUBS_PAGE_SIZE = 20;
const BOOKINGS_PAGE_SIZE = 30;
const LEGACY_RESERVATIONS_PAGE = 50;

/** Endpoints this backend answered with a bare 404 — skip straight to the fallback afterwards. */
const missingEndpoints = new Set<string>();

export function markEndpointMissing(name: string): void {
  missingEndpoints.add(name);
}

export function isEndpointKnownMissing(name: string): boolean {
  return missingEndpoints.has(name);
}

/** Test hook. */
export function resetMissingEndpoints(): void {
  missingEndpoints.clear();
}

export function clubAdminRetry(failureCount: number, error: unknown): boolean {
  const { status, aborted } = parseClubAdminError(error);
  if (aborted) return false;
  if (typeof status === 'number' && status >= 400 && status < 500) return false;
  return failureCount < 2;
}

// ---------------------------------------------------------------------------
// Clubs picker
// ---------------------------------------------------------------------------

export function useClubAdminClubsQuery(q: string, enabled = true) {
  return useInfiniteQuery({
    enabled,
    queryKey: clubAdminKeys.clubs(q),
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      clubAdminApi.listClubs({ limit: CLUBS_PAGE_SIZE, offset: pageParam, q: q.trim() || undefined }, { signal }),
    getNextPageParam: (last, pages) =>
      last.hasMore && last.items.length > 0 ? pages.reduce((n, p) => n + p.items.length, 0) : undefined,
    staleTime: 60_000,
    retry: clubAdminRetry,
  });
}

export function flattenClubs(pages: Array<{ items: ClubAdminClubListItem[] }> | undefined): ClubAdminClubListItem[] {
  const seen = new Set<string>();
  const out: ClubAdminClubListItem[] = [];
  for (const page of pages ?? []) {
    for (const c of page.items) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(c);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export async function fetchConsoleContext(clubId: string, signal?: AbortSignal): Promise<ConsoleContext> {
  if (!isEndpointKnownMissing('context')) {
    try {
      const ctx = await clubAdminApi.getContext(clubId, { signal });
      return { ...ctx, apiVersion: 'v2', legacy: null };
    } catch (e) {
      if (!isEndpointMissing(e)) throw e;
      markEndpointMissing('context');
    }
  }
  const club = await clubAdminApi.getClub(clubId, { signal });
  return legacyContextFromClub(club);
}

export function useClubConsoleContextQuery(clubId: string | undefined) {
  return useQuery({
    queryKey: clubAdminKeys.context(clubId ?? ''),
    queryFn: ({ signal }) => fetchConsoleContext(clubId as string, signal),
    enabled: !!clubId,
    staleTime: 60_000,
    retry: clubAdminRetry,
  });
}

/** Legacy club row — hours and courts for schedules served by a pre-v2 backend. */
export function useLegacyClubInfoQuery(clubId: string, enabled: boolean) {
  return useQuery<LegacyClubInfo>({
    queryKey: clubAdminKeys.legacyClub(clubId),
    queryFn: async ({ signal }) => legacyClubInfo(await clubAdminApi.getClub(clubId, { signal })),
    enabled: enabled && !!clubId,
    staleTime: 5 * 60_000,
    retry: clubAdminRetry,
  });
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

/** `null` = the backend has no dashboard yet; Today derives its numbers from the schedule. */
export function useClubDashboardQuery(clubId: string, date: string, enabled = true) {
  return useQuery<ClubDashboard | null>({
    queryKey: clubAdminKeys.dashboard(clubId, date),
    queryFn: async ({ signal }) => {
      if (isEndpointKnownMissing('dashboard')) return null;
      try {
        return await clubAdminApi.getDashboard(clubId, date, { signal });
      } catch (e) {
        if (!isEndpointMissing(e)) throw e;
        markEndpointMissing('dashboard');
        return null;
      }
    },
    enabled: enabled && !!clubId && !!date,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: clubAdminRetry,
  });
}

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

export function scheduleQueryOptions(clubId: string, date: string) {
  return {
    queryKey: clubAdminKeys.schedule(clubId, date),
    queryFn: ({ signal }: { signal: AbortSignal }) => clubAdminApi.getSchedule(clubId, date, { signal }),
    staleTime: 10_000,
    retry: clubAdminRetry,
  };
}

/**
 * One club-local day. Polls every 15 s while visible; `refetchIntervalInBackground` stays false so
 * a hidden document never polls, and `paused` (a sheet is open) stops it so the slot under the
 * operator's finger does not move.
 */
export function useClubScheduleQuery(clubId: string, date: string, opts: { paused?: boolean; enabled?: boolean } = {}) {
  const paused = !!opts.paused;
  return useQuery({
    ...scheduleQueryOptions(clubId, date),
    enabled: (opts.enabled ?? true) && !!clubId && !!date,
    refetchInterval: (query) => schedulePollInterval(query.state.data, paused),
    refetchIntervalInBackground: false,
  });
}

/** Several days at once (week view). Same cache entries as the day view. */
export function useClubSchedulesQueries(clubId: string, dates: string[], opts: { paused?: boolean; enabled?: boolean } = {}) {
  const paused = !!opts.paused;
  return useQueries({
    queries: dates.map((date) => ({
      ...scheduleQueryOptions(clubId, date),
      enabled: (opts.enabled ?? true) && !!clubId,
      refetchInterval: paused ? (false as const) : SCHEDULE_POLL_MS * 2,
      refetchIntervalInBackground: false,
    })),
  });
}

export function prefetchScheduleDay(qc: QueryClient, clubId: string, date: string): Promise<void> {
  return qc.prefetchQuery(scheduleQueryOptions(clubId, date));
}

// ---------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------

type BookingsPageParam = { cursor: string | null } | { offset: number };

export interface BookingsPage {
  items: BookingItem[];
  next: BookingsPageParam | null;
  /** Served by the legacy `/reservations` list (upcoming only, no billing, client-side filters). */
  legacy: boolean;
}

export async function fetchBookingsPage(
  clubId: string,
  filters: BookingsFilters,
  pageParam: BookingsPageParam,
  signal?: AbortSignal
): Promise<BookingsPage> {
  if ('cursor' in pageParam && !isEndpointKnownMissing('bookings')) {
    try {
      const page = await clubAdminApi.listBookings(
        clubId,
        {
          scope: filters.scope,
          courtId: filters.courtId ?? undefined,
          kinds: filters.kinds,
          payment: filters.payment ?? undefined,
          q: filters.q,
          cursor: pageParam.cursor ?? undefined,
          limit: BOOKINGS_PAGE_SIZE,
        },
        { signal }
      );
      return { items: page.items, next: page.nextCursor ? { cursor: page.nextCursor } : null, legacy: false };
    } catch (e) {
      if (!isEndpointMissing(e)) throw e;
      markEndpointMissing('bookings');
    }
  }
  if (filters.scope === 'past') return { items: [], next: null, legacy: true };
  const offset = 'offset' in pageParam ? pageParam.offset : 0;
  const res = await clubAdminApi.listReservations(clubId, { limit: LEGACY_RESERVATIONS_PAGE, offset }, { signal });
  const items = res.items.map(reservationToBooking).filter((b) => matchesBookingFilters(b, filters));
  return {
    items,
    next: res.hasMore && res.items.length > 0 ? { offset: offset + res.items.length } : null,
    legacy: true,
  };
}

export function useClubBookingsQuery(clubId: string, filters: BookingsFilters) {
  return useInfiniteQuery({
    queryKey: clubAdminKeys.bookings(clubId, filters),
    initialPageParam: { cursor: null } as BookingsPageParam,
    queryFn: ({ pageParam, signal }) => fetchBookingsPage(clubId, filters, pageParam, signal),
    getNextPageParam: (last) => last.next ?? undefined,
    enabled: !!clubId,
    staleTime: 30_000,
    retry: clubAdminRetry,
    meta: { filterKey: bookingsFilterKey(filters) },
  });
}

export function flattenBookings(pages: BookingsPage[] | undefined): BookingItem[] {
  const seen = new Set<string>();
  const out: BookingItem[] = [];
  for (const page of pages ?? []) {
    for (const item of page.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}
