import { useCallback, useEffect, useRef, useState } from 'react';
import type { Club } from '@/types';
import { createScoutNspadelClubBookingProvider } from '@/integrations/booking/createClubBookingProvider';
import { formatClubDateKey } from '@/integrations/booktime/slots';
import { getNspadelSupabaseUrl, isNspadelClub } from '@shared/clubIntegration';
import { NSPADEL_BOOKING_DURATIONS } from '@/integrations/nspadel/config';

export type NspadelSnapshotBanner = 'updating' | 'noSyncToday' | null;

type RefreshOptions = {
  force?: boolean;
};

/**
 * Snapshot refresh for NS Padel Centar. Unlike Booktime/Padeloo there is no
 * server-side snapshot store for this provider — availability is always read
 * live from the club upstream — so a refresh simply re-fetches and records
 * when data was last confirmed.
 */
export function useNspadelSnapshotRefresh(
  club: Club | undefined,
  selectedDate: Date,
  enabled: boolean,
  durationMinutes: number = NSPADEL_BOOKING_DURATIONS[0] ?? 60,
) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [banner, setBanner] = useState<NspadelSnapshotBanner>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);
  const inFlightRef = useRef<Promise<boolean> | null>(null);
  const refreshEpochRef = useRef(0);

  const dateKey = club ? formatClubDateKey(selectedDate, club) : null;

  const refreshSnapshot = useCallback(
    async (_options: RefreshOptions = {}): Promise<boolean> => {
      if (!enabled || !club || !isNspadelClub(club)) return false;
      if (!getNspadelSupabaseUrl(club)) return false;

      const epoch = refreshEpochRef.current;
      if (inFlightRef.current) return inFlightRef.current;

      const run = (async () => {
        const isStale = () => epoch !== refreshEpochRef.current;
        setIsRefreshing(true);
        if (!isStale()) setBanner('updating');
        try {
          const provider = createScoutNspadelClubBookingProvider(club, durationMinutes);
          await provider.fetchSnapshotCourts(selectedDate, formatClubDateKey(selectedDate, club));
          if (isStale()) return false;
          setLastFetchedAt(new Date().toISOString());
          setBanner(null);
          return true;
        } catch (err) {
          if (isStale()) return false;
          console.error('NS Padel snapshot refresh failed:', err);
          setBanner(lastFetchedAt ? null : 'noSyncToday');
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
    [club, durationMinutes, enabled, lastFetchedAt, selectedDate],
  );

  useEffect(() => {
    setBanner(null);
    setLastFetchedAt(null);
    inFlightRef.current = null;
    refreshEpochRef.current += 1;
  }, [club?.id, dateKey, enabled]);

  useEffect(() => {
    if (!enabled || !club || !isNspadelClub(club)) return;
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
