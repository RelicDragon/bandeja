/**
 * The FE owns booking-provider snapshot refresh (constraints: `useClubSnapshotRefresh`). The schedule
 * endpoint only reports `isLoadingExternalSlots` when no snapshot exists for the date, so the console
 * must run the refresh itself — otherwise "Updating…" would spin forever.
 *
 * Dates sync one after another (the anchor first) through a single provider hook, so a week view
 * costs one live-API check and never bursts seven scrapes at the club's system.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clubHasBookingIntegration } from '@shared/clubIntegration';
import { clubWallTimeToUtc } from '@shared/clubAdmin/clubTime';
import { clubAdminApi } from '@/api/clubAdmin';
import { useClubSnapshotRefresh } from '@/hooks/useClubSnapshotRefresh';
import { clubAdminKeys } from '@/queries/clubAdmin/keys';

export function useScheduleExternalSync(
  clubId: string,
  dates: readonly string[],
  timeZone: string,
  enabled: boolean,
  onSynced: (date: string) => void
): { syncing: boolean } {
  // Legacy GET returns the full club (provider config is null for STAFF → no refresh possible).
  const clubQ = useQuery({
    queryKey: clubAdminKeys.fullClub(clubId),
    queryFn: ({ signal }) => clubAdminApi.getClub(clubId, { signal }),
    enabled,
    staleTime: 5 * 60_000,
  });
  const club = clubQ.data && clubHasBookingIntegration(clubQ.data) ? clubQ.data : undefined;

  // Queue position, reset whenever the visible dates change. Past the end it parks on the last date.
  const listKey = dates.join(',');
  const [pos, setPos] = useState({ key: listKey, index: 0 });
  const index = pos.key === listKey ? pos.index : 0;
  const current = dates[Math.min(index, dates.length - 1)];

  // Club-local noon of the date: unambiguous whatever the device zone is.
  const selected = useMemo(() => clubWallTimeToUtc(current, 12 * 60, timeZone), [current, timeZone]);
  const sync = useClubSnapshotRefresh(club, selected, enabled && !!club);
  const syncing = sync.isRefreshingSnapshot || sync.snapshotBanner === 'updating';

  const wasSyncing = useRef(false);
  const latest = useRef({ onSynced, current, listKey, index });
  latest.current = { onSynced, current, listKey, index };
  useEffect(() => {
    if (wasSyncing.current && !syncing) {
      const l = latest.current;
      l.onSynced(l.current);
      setPos({ key: l.listKey, index: l.index + 1 });
    }
    wasSyncing.current = syncing;
  }, [syncing]);

  return { syncing };
}
