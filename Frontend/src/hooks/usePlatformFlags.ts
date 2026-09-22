import { useQuery } from '@tanstack/react-query';
import {
  PUBLIC_PLATFORM_FLAG_DEFAULTS,
  platformFlagsApi,
  type PublicPlatformFlagKey,
  type PublicPlatformFlags,
} from '@/api/platformFlags';
import { queryKeys } from '@/queries/queryKeys';

/**
 * PRD 363 / 364 — the public platform flags, fetched once per session.
 *
 * Five minutes matches the server's `Cache-Control`; the data is then kept for
 * the whole session so a flag never flips while a screen is open. Until the
 * first answer arrives every flag reads its shipped default
 * (`PUBLIC_PLATFORM_FLAG_DEFAULTS`), so the first render is already right
 * unless an admin has actually flipped the switch.
 */
const PLATFORM_FLAGS_STALE_TIME = 5 * 60 * 1000;

export function usePlatformFlags(enabled = true) {
  const query = useQuery<PublicPlatformFlags>({
    queryKey: queryKeys.platformFlags.all,
    queryFn: () => platformFlagsApi.get(),
    enabled,
    staleTime: PLATFORM_FLAGS_STALE_TIME,
    gcTime: Infinity,
    retry: 1,
    refetchOnWindowFocus: false,
  });
  return {
    flags: query.data ?? {},
    isLoaded: query.data !== undefined,
    isEnabled: (key: PublicPlatformFlagKey): boolean =>
      query.data?.[key] ?? PUBLIC_PLATFORM_FLAG_DEFAULTS[key],
  };
}
