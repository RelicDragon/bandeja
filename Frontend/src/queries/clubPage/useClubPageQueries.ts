/**
 * PRD 354 — data for the public club page.
 *
 * Four independent queries rather than one aggregate, so each section paints as
 * its own data lands. The page is a public landing page: first paint on a phone
 * over a slow connection must never wait on the occupancy snapshot or on the
 * games list.
 */
import { useQuery } from '@tanstack/react-query';
import { clubPublicApi } from '@/api/clubPublic';
import { queryKeys } from '@/queries/queryKeys';
import { useAuthStore } from '@/store/authStore';

const CLUB_STALE_MS = 5 * 60 * 1000;
const GAMES_STALE_MS = 60 * 1000;
const TODAY_STALE_MS = 2 * 60 * 1000;
const REGULARS_STALE_MS = 10 * 60 * 1000;

function useViewerId(): string | undefined {
  return useAuthStore((s) => s.user?.id);
}

export function useClubPageQuery(clubId: string | undefined) {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: queryKeys.clubPage.club(clubId ?? '', viewerId),
    queryFn: () => clubPublicApi.getPublicClub(clubId as string),
    enabled: Boolean(clubId),
    staleTime: CLUB_STALE_MS,
    // Offline: serve the cached page instead of an error screen.
    networkMode: 'offlineFirst',
    retry: (failureCount, error: { response?: { status?: number } }) => {
      const status = error?.response?.status;
      if (typeof status === 'number' && status >= 400 && status < 500) return false;
      return failureCount < 2;
    },
  });
}

export function useClubPageGamesQuery(clubId: string | undefined) {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: queryKeys.clubPage.games(clubId ?? '', viewerId),
    queryFn: () => clubPublicApi.getUpcomingGames(clubId as string),
    enabled: Boolean(clubId),
    staleTime: GAMES_STALE_MS,
    networkMode: 'offlineFirst',
  });
}

export function useClubPageRegularsQuery(clubId: string | undefined, enabled = true) {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: queryKeys.clubPage.regulars(clubId ?? '', viewerId),
    queryFn: () => clubPublicApi.getRegulars(clubId as string),
    enabled: Boolean(clubId) && enabled,
    staleTime: REGULARS_STALE_MS,
    networkMode: 'offlineFirst',
  });
}

/**
 * Only fetched for clubs that actually have a booking integration — a club with
 * no provider has no snapshot to show, and the request would be pure waste on a
 * metered connection.
 */
export function useClubTodayAvailabilityQuery(clubId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.clubPage.today(clubId ?? ''),
    queryFn: () => clubPublicApi.getTodayAvailability(clubId as string),
    enabled: Boolean(clubId) && enabled,
    staleTime: TODAY_STALE_MS,
    networkMode: 'offlineFirst',
    retry: false,
  });
}
