import { queryOptions, useQuery } from '@tanstack/react-query';
import { usersApi, type UserStats } from '@/api/users';
import type { Sport } from '@shared/sport';
import { queryKeys } from './queryKeys';

const USER_STATS_STALE_TIME = 5 * 60 * 1000;

export function userStatsQueryOptions(
  userId: string | undefined,
  sport?: Sport,
  enabled = true,
) {
  const isEnabled = enabled && !!userId;
  return queryOptions({
    queryKey: queryKeys.userStats(userId ?? '', sport),
    queryFn: async (): Promise<UserStats> => {
      const response = await usersApi.getUserStats(userId!, sport);
      return response.data;
    },
    staleTime: USER_STATS_STALE_TIME,
    enabled: isEnabled,
  });
}

export function useUserStatsQuery(
  userId: string | undefined,
  sport?: Sport,
  options?: { enabled?: boolean },
) {
  const enabled = options?.enabled ?? !!userId;
  return useQuery(userStatsQueryOptions(userId, sport, enabled));
}
