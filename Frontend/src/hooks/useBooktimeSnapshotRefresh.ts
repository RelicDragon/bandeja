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

      if (inFlightRef.current) return inFlightRef.current;

      const run = (async () => {
        const dateKey = formatClubDateKey(selectedDate, club);
        let fetchedAtBeforeRefresh: string | null = null;
        setIsRefreshing(true);
        setBanner('updating');

        try {
          const snapshotRes = await booktimeApi.getSnapshot(club.id, dateKey);
          const existingFetchedAt = snapshotRes.data?.fetchedAt ?? null;
          fetchedAtBeforeRefresh = existingFetchedAt;
          setLastFetchedAt(existingFetchedAt);

          if (!options.force && existingFetchedAt && !isSnapshotStale(existingFetchedAt)) {
            setBanner(null);
            return true;
          }

          if (!liveApiEnabled) {
            setBanner(existingFetchedAt ? 'scoutPoolEmpty' : 'noSyncToday');
            return false;
          }

          const provider = createScoutBooktimeClubBookingProvider(club, companyId);
          const courts = await provider.fetchSnapshotCourts(selectedDate, dateKey);
          const fetchedAt = new Date().toISOString();
          await booktimeApi.putSnapshot(club.id, {
            date: dateKey,
            fetchedAt,
            force: options.force === true,
            courts,
          });

          setLastFetchedAt(fetchedAt);
          setBanner(null);
          return true;
        } catch (err) {
          if (requestStatus(err) === 429) {
            setBanner(null);
            return false;
          }
          console.error('Club booking snapshot refresh failed:', err);
          setBanner(fetchedAtBeforeRefresh ? 'scoutPoolEmpty' : 'noSyncToday');
          return false;
        } finally {
          setIsRefreshing(false);
          inFlightRef.current = null;
        }
      })();

      inFlightRef.current = run;
      return run;
    },
    [club, enabled, liveApiEnabled, selectedDate]
  );

  useEffect(() => {
    setBanner(null);
    setLastFetchedAt(null);
    inFlightRef.current = null;
  }, [club?.id, dateKey, enabled]);

  useEffect(() => {
    if (!enabled || !club || !isBooktimeClub(club)) return;
    void refreshSnapshot();
  }, [enabled, club?.id, dateKey, refreshSnapshot, club]);

  return {
    refreshSnapshot,
    isRefreshingSnapshot: isRefreshing,
    snapshotBanner: banner,
    lastFetchedAt,
    liveApiEnabled,
    liveApiLoading,
  };
}
