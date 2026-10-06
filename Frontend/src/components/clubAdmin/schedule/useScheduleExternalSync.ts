/**
 * The FE owns booking-provider snapshot refresh (constraints: `useClubSnapshotRefresh`). The schedule
 * endpoint only reports `isLoadingExternalSlots` when no snapshot exists for the date, so the console
 * must run the refresh itself — otherwise "Updating…" would spin forever.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clubHasBookingIntegration } from '@shared/clubIntegration';
import { clubWallTimeToUtc } from '@shared/clubAdmin/clubTime';
import { clubAdminApi } from '@/api/clubAdmin';
import { useClubSnapshotRefresh } from '@/hooks/useClubSnapshotRefresh';
import { clubAdminKeys } from '@/queries/clubAdmin/keys';

export function useScheduleExternalSync(
  clubId: string,
  date: string,
  timeZone: string,
  enabled: boolean,
  onSynced: () => void
): { syncing: boolean } {
  // Legacy GET returns the full club (provider config is null for STAFF → no refresh possible).
  const clubQ = useQuery({
    queryKey: clubAdminKeys.fullClub(clubId),
    queryFn: ({ signal }) => clubAdminApi.getClub(clubId, { signal }),
    enabled,
    staleTime: 5 * 60_000,
  });
  const club = clubQ.data && clubHasBookingIntegration(clubQ.data) ? clubQ.data : undefined;
  // Club-local noon of the date: unambiguous whatever the device zone is.
  const selected = useMemo(() => clubWallTimeToUtc(date, 12 * 60, timeZone), [date, timeZone]);
  const sync = useClubSnapshotRefresh(club, selected, enabled && !!club);
  const syncing = sync.isRefreshingSnapshot || sync.snapshotBanner === 'updating';

  const wasSyncing = useRef(false);
  const onSyncedRef = useRef(onSynced);
  onSyncedRef.current = onSynced;
  useEffect(() => {
    if (wasSyncing.current && !syncing) onSyncedRef.current();
    wasSyncing.current = syncing;
  }, [syncing]);

  return { syncing };
}
