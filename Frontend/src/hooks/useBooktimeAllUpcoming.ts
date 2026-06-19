import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { BooktimeMyClubRow } from '@/api/booktime';
import {
  invalidateBooktimeAllUpcomingCache,
  loadAllBooktimeUpcoming,
  peekCachedBooktimeUpcoming,
  setBooktimeAllUpcomingDisplayCache,
  type AggregatedBooktimeBooking,
} from '@/integrations/booktime/booktimeAllUpcomingLoader';

export type { AggregatedBooktimeBooking };

type UpcomingSnapshot = {
  bookings: AggregatedBooktimeBooking[];
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

function runSharedLoad(
  clubs: BooktimeMyClubRow[],
  enabled: boolean,
  connectedKey: string,
  invalidate: boolean,
): Promise<void> {
  if (invalidate) {
    invalidateBooktimeAllUpcomingCache();
  }

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
      const cachedBookings = await peekCachedBooktimeUpcoming(clubs, enabled);
      if (cachedBookings) {
        setKeyState(connectedKey, { bookings: cachedBookings, loading: false });
        return;
      }
    }

    setKeyState(connectedKey, {
      bookings: current?.bookings ?? [],
      loading: true,
    });

    const bookings = await loadAllBooktimeUpcoming(clubs, enabled);
    setKeyState(connectedKey, { bookings, loading: false });
  })().finally(() => {
    inFlightByKey.delete(connectedKey);
  });

  inFlightByKey.set(connectedKey, loadPromise);
  return loadPromise;
}

export function resetBooktimeAllUpcomingSharedState(): void {
  sharedByKey.clear();
  inFlightByKey.clear();
  notifyShared();
}

export function useBooktimeAllUpcoming(
  clubs: BooktimeMyClubRow[],
  enabled: boolean,
  refreshKey = 0,
) {
  const clubsRef = useRef(clubs);
  clubsRef.current = clubs;

  const connectedKey = useMemo(
    () =>
      clubs
        .filter((club) => club.connected && club.companyId)
        .map((club) => club.clubId)
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
      setBooktimeAllUpcomingDisplayCache(clubsRef.current, bookings);
    },
  };
}
