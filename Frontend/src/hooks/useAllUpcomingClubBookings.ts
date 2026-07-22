import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { AggregatedBooktimeBooking } from '@/integrations/booktime/booktimeAllUpcomingLoader';
import {
  loadAllBooktimeUpcoming,
  peekCachedBooktimeUpcoming,
  setBooktimeAllUpcomingDisplayCache,
} from '@/integrations/booktime/booktimeAllUpcomingLoader';
import { subscribeBooktimeAllUpcomingCacheInvalidation } from '@/integrations/booktime/booktimeAllUpcomingCacheInvalidation';
import type { ConnectedBookingClubRow } from '@/hooks/connectedBookingClubs';
import { connectedClubRowToBooktimeRow } from '@/hooks/connectedBookingClubs';
import type { PadelooMyClubRow } from '@/api/padeloo';
import type { KlikterenMyClubRow } from '@/api/klikteren';
import {
  loadPadelooUpcomingForClubs,
  type AggregatedPadelooBooking,
} from '@/integrations/padeloo/padelooAllUpcomingLoader';
import {
  loadKlikterenUpcomingForClubs,
  type AggregatedKlikterenBooking,
} from '@/integrations/klikteren/klikterenAllUpcomingLoader';

export type AggregatedClubBooking = (
  | AggregatedBooktimeBooking
  | AggregatedPadelooBooking
  | AggregatedKlikterenBooking
) & {
  integrationType?: 'BOOKTIME' | 'PADELOO' | 'KLIKTEREN';
};

type UpcomingSnapshot = {
  bookings: AggregatedClubBooking[];
  loading: boolean;
};

const EMPTY_SNAPSHOT: UpcomingSnapshot = { bookings: [], loading: false };

const sharedByKey = new Map<string, UpcomingSnapshot>();
const inFlightByKey = new Map<string, Promise<void>>();
const subscribers = new Set<() => void>();

function subscribeShared(listener: () => void): () => void {
  subscribers.add(listener);
  return () => subscribers.delete(listener);
}

function getSnapshot(connectedKey: string): UpcomingSnapshot {
  if (!connectedKey) return EMPTY_SNAPSHOT;
  return sharedByKey.get(connectedKey) ?? EMPTY_SNAPSHOT;
}

function notifyShared(): void {
  subscribers.forEach((listener) => listener());
}

function setKeyState(connectedKey: string, next: UpcomingSnapshot): void {
  sharedByKey.set(connectedKey, next);
  notifyShared();
}

function toBooktimeRows(clubs: ConnectedBookingClubRow[]) {
  return clubs
    .filter((club) => club.integrationType === 'BOOKTIME' && club.connected && club.companyId)
    .map(connectedClubRowToBooktimeRow);
}

function toPadelooRows(clubs: ConnectedBookingClubRow[]): PadelooMyClubRow[] {
  return clubs
    .filter((club) => club.integrationType === 'PADELOO' && club.connected && club.padelooClubId)
    .map((club) => ({
      clubId: club.clubId,
      clubName: club.clubName,
      avatar: club.avatar,
      padelooClubId: club.padelooClubId ?? null,
      connected: club.connected,
      email: club.email ?? null,
      scoutOptIn: club.scoutOptIn,
      cityTimezone: club.cityTimezone,
      courts: club.courts,
    }));
}

function toKlikterenRows(clubs: ConnectedBookingClubRow[]): KlikterenMyClubRow[] {
  return clubs
    .filter((club) => club.integrationType === 'KLIKTEREN' && club.connected && club.klikterenVenueId)
    .map((club) => ({
      clubId: club.clubId,
      clubName: club.clubName,
      avatar: club.avatar,
      klikterenVenueId: club.klikterenVenueId ?? null,
      connected: club.connected,
      email: club.email ?? null,
      scoutOptIn: club.scoutOptIn,
      cityTimezone: club.cityTimezone,
      courts: club.courts,
    }));
}

async function loadMergedUpcoming(
  clubs: ConnectedBookingClubRow[],
  enabled: boolean,
): Promise<AggregatedClubBooking[]> {
  if (!enabled) return [];

  const booktimeClubs = toBooktimeRows(clubs);
  const padelooClubs = toPadelooRows(clubs);
  const klikterenClubs = toKlikterenRows(clubs);

  const [booktimeBookings, padelooBookings, klikterenBookings] = await Promise.all([
    booktimeClubs.length > 0 ? loadAllBooktimeUpcoming(booktimeClubs, enabled) : Promise.resolve([]),
    padelooClubs.length > 0 ? loadPadelooUpcomingForClubs(padelooClubs) : Promise.resolve([]),
    klikterenClubs.length > 0 ? loadKlikterenUpcomingForClubs(klikterenClubs) : Promise.resolve([]),
  ]);

  const merged: AggregatedClubBooking[] = [
    ...booktimeBookings.map((booking) => ({ ...booking, integrationType: 'BOOKTIME' as const })),
    ...padelooBookings,
    ...klikterenBookings,
  ];

  merged.sort(
    (a, b) =>
      new Date(a.bookingStart).getTime() - new Date(b.bookingStart).getTime(),
  );
  return merged;
}

function runSharedLoad(
  clubs: ConnectedBookingClubRow[],
  enabled: boolean,
  connectedKey: string,
  invalidate: boolean,
): Promise<void> {
  if (!enabled || connectedKey.length === 0) {
    return Promise.resolve();
  }

  const existingLoad = inFlightByKey.get(connectedKey);
  if (existingLoad) return existingLoad;

  const current = sharedByKey.get(connectedKey);
  if (!invalidate && current && !current.loading) {
    return Promise.resolve();
  }

  const loadPromise = (async () => {
    if (!invalidate) {
      const booktimeOnly = toBooktimeRows(clubs);
      const cachedBookings = await peekCachedBooktimeUpcoming(booktimeOnly, enabled);
      if (cachedBookings && toPadelooRows(clubs).length === 0 && toKlikterenRows(clubs).length === 0) {
        setKeyState(connectedKey, {
          bookings: cachedBookings.map((booking) => ({
            ...booking,
            integrationType: 'BOOKTIME' as const,
          })),
          loading: false,
        });
        return;
      }
    }

    setKeyState(connectedKey, {
      bookings: current?.bookings ?? [],
      loading: true,
    });

    const bookings = await loadMergedUpcoming(clubs, enabled);
    setKeyState(connectedKey, { bookings, loading: false });

    const booktimeOnly = toBooktimeRows(clubs);
    if (booktimeOnly.length > 0) {
      setBooktimeAllUpcomingDisplayCache(
        booktimeOnly,
        bookings.filter((b) => b.integrationType === 'BOOKTIME') as AggregatedBooktimeBooking[],
      );
    }
  })().finally(() => {
    inFlightByKey.delete(connectedKey);
  });

  inFlightByKey.set(connectedKey, loadPromise);
  return loadPromise;
}

export function resetAllUpcomingClubBookingsSharedState(): void {
  sharedByKey.clear();
  inFlightByKey.clear();
  notifyShared();
}

subscribeBooktimeAllUpcomingCacheInvalidation(resetAllUpcomingClubBookingsSharedState);

export function useAllUpcomingClubBookings(
  clubs: ConnectedBookingClubRow[],
  enabled: boolean,
  refreshKey = 0,
) {
  const clubsRef = useRef(clubs);
  clubsRef.current = clubs;

  const connectedKey = useMemo(
    () =>
      clubs
        .filter((club) => club.connected && (club.companyId || club.padelooClubId || club.klikterenVenueId))
        .map((club) => `${club.integrationType}:${club.clubId}`)
        .sort()
        .join('|'),
    [clubs],
  );

  const prevRefreshKeyRef = useRef(refreshKey);

  useEffect(() => {
    const invalidate = refreshKey !== prevRefreshKeyRef.current;
    prevRefreshKeyRef.current = refreshKey;
    void runSharedLoad(clubsRef.current, enabled, connectedKey, invalidate);
  }, [connectedKey, enabled, refreshKey]);

  const snapshot = useSyncExternalStore(
    subscribeShared,
    () => getSnapshot(connectedKey),
    () => getSnapshot(connectedKey),
  );

  const reload = useCallback(async () => {
    await runSharedLoad(clubsRef.current, enabled, connectedKey, true);
  }, [connectedKey, enabled]);

  return {
    bookings: snapshot.bookings,
    loading: snapshot.loading,
    reload,
    removeBooking: (bookingId: string) => {
      const current = sharedByKey.get(connectedKey);
      if (!current) return;
      const bookings = current.bookings.filter((booking) => booking.uuid !== bookingId);
      setKeyState(connectedKey, {
        ...current,
        bookings,
      });
    },
  };
}
