import { useCallback, useEffect, useRef, useState } from 'react';
import type { Club } from '@/types';
import { weltnerApi } from '@/api/weltner';
import { formatClubDateKey } from '@/integrations/booktime/slots';
import { isWeltnerClub } from '@shared/clubIntegration';

export type WeltnerSnapshotBanner = 'updating' | 'noSyncToday' | null;

type RefreshOptions = {
  force?: boolean;
};

/**
 * Availability refresh for Weltner. Unlike Booktime/Padeloo there is no
 * server-side snapshot store for this provider — availability is always read
 * live from the club upstream — so a refresh simply re-fetches and records
 * when data was last confirmed.
 */
export function useWeltnerSnapshotRefresh(
  club: Club | undefined,
  selectedDate: Date,
  enabled: boolean,
) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [banner, setBanner] = useState<WeltnerSnapshotBanner>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);
  const inFlightRef = useRef<Promise<boolean> | null>(null);
  const refreshEpochRef = useRef(0);
  // Last confirmed fetch. A ref, not state: refreshSnapshot must keep a
  // stable identity or the auto-refresh effect below re-fires forever.
  const lastOkRef = useRef<string | null>(null);

  const dateKey = club ? formatClubDateKey(selectedDate, club) : null;

  const refreshSnapshot = useCallback(
    async (_options: RefreshOptions = {}): Promise<boolean> => {
      if (!enabled || !club || !isWeltnerClub(club)) return false;

      const epoch = refreshEpochRef.current;
      if (inFlightRef.current) return inFlightRef.current;

      const run = (async () => {
        const isStale = () => epoch !== refreshEpochRef.current;
        setIsRefreshing(true);
        if (!isStale()) setBanner('updating');
        try {
          await weltnerApi.availability(club.id, formatClubDateKey(selectedDate, club));
          if (isStale()) return false;
          const fetchedAt = new Date().toISOString();
          lastOkRef.current = fetchedAt;
          setLastFetchedAt(fetchedAt);
          setBanner(null);
          return true;
        } catch (err) {
          if (isStale()) return false;
          console.error('Weltner snapshot refresh failed:', err);
          setBanner(lastOkRef.current ? null : 'noSyncToday');
          return false;
        } finally {
          if (!isStale()) {
            setIsRefreshing(false);
            inFlightRef.current = null;
          }
        }
      })();

      inFlightRef.current = run;
      return run;
    },
    [club, enabled, selectedDate],
  );

  useEffect(() => {
    setBanner(null);
    setLastFetchedAt(null);
    lastOkRef.current = null;
    inFlightRef.current = null;
    refreshEpochRef.current += 1;
  }, [club?.id, dateKey, enabled]);

  useEffect(() => {
    if (!enabled || !club || !isWeltnerClub(club)) return;
    void refreshSnapshot();
  }, [enabled, club?.id, dateKey, refreshSnapshot, club]);

  return {
    refreshSnapshot,
    isRefreshingSnapshot: isRefreshing,
    snapshotBanner: banner,
    lastFetchedAt,
    liveApiEnabled: true,
    liveApiLoading: false,
  };
}
