import { useCallback, useEffect, useRef, useState } from 'react';
import { booktimeApi } from '@/api/booktime';
import type { Club } from '@/types';
import { useBooktimeLiveApiEnabled } from '@/hooks/useBooktimeLiveApiEnabled';
import { createScoutBooktimeClubBookingProvider } from '@/integrations/booking/createBooktimeClubBookingProvider';
import {
  formatClubDateKey,
  isSnapshotStale,
} from '@/integrations/booktime/slots';
import { getBooktimeCompanyId, isBooktimeClub } from '@shared/clubIntegration';

export type BooktimeSnapshotBanner = 'updating' | 'noSyncToday' | 'scoutPoolEmpty' | null;

type RefreshOptions = {
  force?: boolean;
};

function requestStatus(err: unknown): number {
  return err && typeof err === 'object' && 'status' in err ? Number((err as { status: number }).status) : 0;
}

export function useBooktimeSnapshotRefresh(
  club: Club | undefined,
  selectedDate: Date,
  enabled: boolean
) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [banner, setBanner] = useState<BooktimeSnapshotBanner>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);
  const inFlightRef = useRef<Promise<boolean> | null>(null);
  const refreshEpochRef = useRef(0);
  const { apiEnabled: liveApiEnabled, loading: liveApiLoading } = useBooktimeLiveApiEnabled(
    club?.id,
    enabled
  );

  const dateKey = club ? formatClubDateKey(selectedDate, club) : null;

  const refreshSnapshot = useCallback(
    async (options: RefreshOptions = {}): Promise<boolean> => {
      if (!enabled || !club || !isBooktimeClub(club)) return false;
      const companyId = getBooktimeCompanyId(club);
      if (!companyId) return false;
      if (liveApiLoading) return false;

      const epoch = refreshEpochRef.current;
      if (inFlightRef.current) return inFlightRef.current;

      const run = (async () => {
        const dateKey = formatClubDateKey(selectedDate, club);
        let fetchedAtBeforeRefresh: string | null = null;
        const isStale = () => epoch !== refreshEpochRef.current;

        setIsRefreshing(true);
        if (!isStale()) setBanner('updating');

        try {
          const snapshotRes = await booktimeApi.getSnapshot(club.id, dateKey);
          if (isStale()) return false;

          const existingFetchedAt = snapshotRes.data?.fetchedAt ?? null;
          fetchedAtBeforeRefresh = existingFetchedAt;
          if (!isStale()) setLastFetchedAt(existingFetchedAt);

          if (!options.force && existingFetchedAt && !isSnapshotStale(existingFetchedAt)) {
            if (!isStale()) setBanner(null);
            return true;
          }

          const provider = createScoutBooktimeClubBookingProvider(club, companyId);
          const courts = await provider.fetchSnapshotCourts(selectedDate, dateKey);
          if (isStale()) return false;

          const fetchedAt = new Date().toISOString();
          await booktimeApi.putSnapshot(club.id, {
            date: dateKey,
            fetchedAt,
            force: options.force === true,
            courts,
          });

          if (!isStale()) {
            setLastFetchedAt(fetchedAt);
            setBanner(null);
          }
          return true;
        } catch (err) {
          if (isStale()) return false;
          if (requestStatus(err) === 429) {
            setBanner(null);
            return false;
          }
          console.error('Club booking snapshot refresh failed:', err);
          setBanner(fetchedAtBeforeRefresh ? 'scoutPoolEmpty' : 'noSyncToday');
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
    [club, enabled, liveApiLoading, selectedDate]
  );

  useEffect(() => {
    setBanner(null);
    setLastFetchedAt(null);
    inFlightRef.current = null;
    refreshEpochRef.current += 1;
  }, [club?.id, dateKey, enabled]);

  useEffect(() => {
    if (liveApiLoading) return;
    refreshEpochRef.current += 1;
    inFlightRef.current = null;
  }, [liveApiEnabled, liveApiLoading]);

  useEffect(() => {
    if (!enabled || !club || !isBooktimeClub(club)) return;
    if (liveApiLoading) {
      setBanner('updating');
      return;
    }
    void refreshSnapshot();
  }, [enabled, club?.id, dateKey, refreshSnapshot, club, liveApiLoading]);

  return {
    refreshSnapshot,
    isRefreshingSnapshot: isRefreshing,
    snapshotBanner: banner,
    lastFetchedAt,
    liveApiEnabled,
    liveApiLoading,
  };
}
