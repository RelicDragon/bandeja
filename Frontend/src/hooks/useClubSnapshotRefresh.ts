import type { Club } from '@/types';
import { isBooktimeClub, isKlikterenClub, isPadelooClub } from '@shared/clubIntegration';
import { useBooktimeSnapshotRefresh, type BooktimeSnapshotBanner } from '@/hooks/useBooktimeSnapshotRefresh';
import { usePadelooSnapshotRefresh, type PadelooSnapshotBanner } from '@/hooks/usePadelooSnapshotRefresh';
import { useKlikterenSnapshotRefresh, type KlikterenSnapshotBanner } from '@/hooks/useKlikterenSnapshotRefresh';

export type ClubSnapshotBanner = BooktimeSnapshotBanner | PadelooSnapshotBanner | KlikterenSnapshotBanner;

export function useClubSnapshotRefresh(
  club: Club | undefined,
  selectedDate: Date,
  enabled: boolean,
  options?: { durationMinutes?: number },
) {
  const booktime = useBooktimeSnapshotRefresh(
    club,
    selectedDate,
    enabled && isBooktimeClub(club),
  );
  const padeloo = usePadelooSnapshotRefresh(
    club,
    selectedDate,
    enabled && isPadelooClub(club),
    options?.durationMinutes,
  );
  const klikteren = useKlikterenSnapshotRefresh(
    club,
    selectedDate,
    enabled && isKlikterenClub(club),
    options?.durationMinutes,
  );

  if (isKlikterenClub(club)) return klikteren;
  if (isPadelooClub(club)) return padeloo;
  if (isBooktimeClub(club)) return booktime;

  return {
    refreshSnapshot: async () => false,
    isRefreshingSnapshot: false,
    snapshotBanner: null as ClubSnapshotBanner,
    lastFetchedAt: null as string | null,
    liveApiEnabled: false,
    liveApiLoading: false,
  };
}
