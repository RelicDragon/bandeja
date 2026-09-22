import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { playIntentsApi } from '@/api/playIntents';
import { useAuthStore } from '@/store/authStore';
import { usePlatformFlags } from '@/hooks/usePlatformFlags';
import { playIntentKeys } from '@/hooks/usePlayIntent';
import {
  resolveLookingCountDisplay,
  type LookingCountDisplay,
} from '@/components/home/lookingCount';

/** Matches the server's 60 s cache: refetching sooner cannot return anything new. */
export const LOOKING_COUNT_STALE_MS = 60_000;

export const lookingCountKeys = {
  scope: (cityId?: string, sport?: string) =>
    [...playIntentKeys.all, 'looking-count', cityId, sport] as const,
};

export interface LookingCountState {
  /** Admin flag `FIND_LOOKING_COUNT_ENABLED`, as the client currently knows it. */
  flagOn: boolean;
  /** What to show, or `null` (flag off, not loaded, or fewer than three people). */
  display: LookingCountDisplay | null;
}

/**
 * PRD 363 — "{n} people are looking to play today" for a city and sport.
 *
 * Issues no request while the admin flag is off, the viewer is signed out or
 * there is no city; the Find empty state and the play-intent strip both read
 * the same query.
 */
export function useLookingCount(
  cityId?: string | null,
  sport?: string | null,
  options?: { enabled?: boolean },
): LookingCountState {
  const isAuthenticated = useAuthStore((s) => !!s.user);
  const flagOn = usePlatformFlags().isEnabled('FIND_LOOKING_COUNT_ENABLED');
  const normalizedCityId = cityId?.trim() || undefined;
  const normalizedSport = sport?.trim() || undefined;
  const enabled =
    (options?.enabled ?? true) && flagOn && isAuthenticated && !!normalizedCityId;

  const { data } = useQuery({
    queryKey: lookingCountKeys.scope(normalizedCityId, normalizedSport),
    queryFn: () =>
      playIntentsApi.getLookingCount({ cityId: normalizedCityId, sport: normalizedSport }),
    enabled,
    staleTime: LOOKING_COUNT_STALE_MS,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  return useMemo(
    () => ({
      flagOn,
      display: resolveLookingCountDisplay({
        enabled: flagOn,
        count: data?.count,
        dayKeys: data?.dayKeys,
      }),
    }),
    [flagOn, data?.count, data?.dayKeys],
  );
}
