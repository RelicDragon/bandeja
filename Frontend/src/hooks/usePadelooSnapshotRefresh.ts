import { useCallback, useEffect, useRef, useState } from 'react';
import { padelooApi } from '@/api/padeloo';
import type { Club } from '@/types';
import { createScoutPadelooClubBookingProvider } from '@/integrations/booking/createClubBookingProvider';
import {
  formatClubDateKey,
  isSnapshotStale,
} from '@/integrations/padeloo/slots';
import { getPadelooClubId, isPadelooClub } from '@shared/clubIntegration';
import { PADELOO_BOOKING_DURATIONS } from '@/integrations/padeloo/config';

export type PadelooSnapshotBanner = 'updating' | 'noSyncToday' | null;

type RefreshOptions = {
  force?: boolean;
};

function requestStatus(err: unknown): number {
  return err && typeof err === 'object' && 'status' in err ? Number((err as { status: number }).status) : 0;
}

export function usePadelooSnapshotRefresh(
  club: Club | undefined,
  selectedDate: Date,
  enabled: boolean,
  durationMinutes: number = PADELOO_BOOKING_DURATIONS[0],
) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [banner, setBanner] = useState<PadelooSnapshotBanner>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);
  const inFlightRef = useRef<Promise<boolean> | null>(null);
  const refreshEpochRef = useRef(0);

  const dateKey = club ? formatClubDateKey(selectedDate, club) : null;

  const refreshSnapshot = useCallback(
    async (options: RefreshOptions = {}): Promise<boolean> => {
      if (!enabled || !club || !isPadelooClub(club)) return false;
      const padelooClubId = getPadelooClubId(club);
      if (padelooClubId == null) return false;

      const epoch = refreshEpochRef.current;
      if (inFlightRef.current) return inFlightRef.current;

      const run = (async () => {
        const dateKey = formatClubDateKey(selectedDate, club);
        let fetchedAtBeforeRefresh: string | null = null;
        const isStale = () => epoch !== refreshEpochRef.current;

        setIsRefreshing(true);
        if (!isStale()) setBanner('updating');

        try {
          const snapshotRes = await padelooApi.getSnapshot(club.id, dateKey);
          if (isStale()) return false;

          const existingFetchedAt = snapshotRes.data?.fetchedAt ?? null;
          fetchedAtBeforeRefresh = existingFetchedAt;
          if (!isStale()) setLastFetchedAt(existingFetchedAt);

          if (!options.force && existingFetchedAt && !isSnapshotStale(existingFetchedAt)) {
            if (!isStale()) setBanner(null);
            return true;
          }

          const provider = createScoutPadelooClubBookingProvider(club, padelooClubId, durationMinutes);
          const courts = await provider.fetchSnapshotCourts(selectedDate, dateKey);
          if (isStale()) return false;

          const fetchedAt = new Date().toISOString();
          await padelooApi.putSnapshot(club.id, {
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
          console.error('Padeloo snapshot refresh failed:', err);
          setBanner(fetchedAtBeforeRefresh ? null : 'noSyncToday');
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
    [club, durationMinutes, enabled, selectedDate],
  );

  useEffect(() => {
    setBanner(null);
    setLastFetchedAt(null);
    inFlightRef.current = null;
    refreshEpochRef.current += 1;
  }, [club?.id, dateKey, enabled]);

  useEffect(() => {
    if (!enabled || !club || !isPadelooClub(club)) return;
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
