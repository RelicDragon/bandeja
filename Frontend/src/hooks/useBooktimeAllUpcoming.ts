import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { BooktimeMyClubRow } from '@/api/booktime';
import {
  invalidateBooktimeAllUpcomingCache,
  loadAllBooktimeUpcoming,
  type AggregatedBooktimeBooking,
} from '@/integrations/booktime/booktimeAllUpcomingLoader';

export type { AggregatedBooktimeBooking };

type SharedUpcomingState = {
  connectedKey: string;
  bookings: AggregatedBooktimeBooking[];
  loading: boolean;
  version: number;
};

let sharedState: SharedUpcomingState = {
  connectedKey: '',
  bookings: [],
  loading: false,
  version: 0,
};

const subscribers = new Set<() => void>();
let sharedLoadKey = '';
let sharedLoadPromise: Promise<void> | null = null;

function subscribeShared(listener: () => void): () => void {
  subscribers.add(listener);
  return () => subscribers.delete(listener);
}

function getSharedVersion(): number {
  return sharedState.version;
}

function notifyShared(): void {
  sharedState = { ...sharedState, version: sharedState.version + 1 };
  subscribers.forEach((listener) => listener());
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
    if (sharedState.connectedKey || sharedState.bookings.length > 0 || sharedState.loading) {
      sharedState = {
        connectedKey: '',
        bookings: [],
        loading: false,
        version: sharedState.version,
      };
      notifyShared();
    }
    return Promise.resolve();
  }

  if (sharedLoadPromise && sharedLoadKey === connectedKey) {
    return sharedLoadPromise;
  }

  if (!invalidate && sharedState.connectedKey === connectedKey && !sharedState.loading) {
    return Promise.resolve();
  }

  sharedLoadKey = connectedKey;
  sharedState = {
    connectedKey,
    bookings: sharedState.connectedKey === connectedKey ? sharedState.bookings : [],
    loading: true,
    version: sharedState.version,
  };
  notifyShared();

  sharedLoadPromise = loadAllBooktimeUpcoming(clubs, enabled)
    .then((bookings) => {
      if (sharedLoadKey === connectedKey) {
        sharedState = {
          connectedKey,
          bookings,
          loading: false,
          version: sharedState.version,
        };
        notifyShared();
      }
    })
    .finally(() => {
      if (sharedLoadKey === connectedKey) {
        sharedLoadPromise = null;
        sharedLoadKey = '';
      }
    });

  return sharedLoadPromise;
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

  useEffect(() => {
    void runSharedLoad(clubsRef.current, enabled, connectedKey, refreshKey > 0);
  }, [connectedKey, enabled, refreshKey]);

  useSyncExternalStore(subscribeShared, getSharedVersion, getSharedVersion);

  const reload = useCallback(async () => {
    await runSharedLoad(clubsRef.current, enabled, connectedKey, true);
  }, [connectedKey, enabled]);

  const bookings =
    sharedState.connectedKey === connectedKey ? sharedState.bookings : [];
  const loading =
    sharedState.connectedKey === connectedKey ? sharedState.loading : false;

  return {
    bookings,
    loading,
    reload,
    removeBooking: (bookingId: string) => {
      invalidateBooktimeAllUpcomingCache();
      if (sharedState.connectedKey === connectedKey) {
        sharedState = {
          ...sharedState,
          bookings: sharedState.bookings.filter((booking) => booking.uuid !== bookingId),
          version: sharedState.version,
        };
        notifyShared();
      }
    },
  };
}
