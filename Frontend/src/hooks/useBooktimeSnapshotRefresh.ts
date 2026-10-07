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
  const inFlightRef = useRef<{ run: Promise<boolean>; force: boolean } | null>(null);
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

      // A forced refresh (right after a booking / cancel) must read the club again: an
      // unforced one already in flight may have started before the change.
      while (inFlightRef.current) {
        const current = inFlightRef.current;
        if (!options.force || current.force) return current.run;
        await current.run.catch(() => false);
        if (inFlightRef.current === current) inFlightRef.current = null;
      }
      const epoch = refreshEpochRef.current;
      const entry: { run: Promise<boolean>; force: boolean } = { run: Promise.resolve(false), force: options.force === true };

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
            if (inFlightRef.current === entry) inFlightRef.current = null;
          }
        }
      })();

      entry.run = run;
      inFlightRef.current = entry;
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
