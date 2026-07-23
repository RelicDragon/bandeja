import { queryOptions, useQuery } from '@tanstack/react-query';
import { usersApi, type UserStats } from '@/api/users';
import type { Sport } from '@shared/sport';
import { queryKeys } from './queryKeys';

const USER_STATS_STALE_TIME = 5 * 60 * 1000;

export function userStatsQueryOptions(
  userId: string | undefined,
  sport?: Sport,
  enabled = true,
  keepPreviousForSameUser = false,
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
    placeholderData: keepPreviousForSameUser
      ? (previousData, previousQuery) => {
          const previousUserId = previousQuery?.queryKey[2];
          if (!userId || previousUserId !== userId) return undefined;
          return previousData;
        }
      : undefined,
  });
}

export function useUserStatsQuery(
  userId: string | undefined,
  sport?: Sport,
  options?: { enabled?: boolean; keepPrevious?: boolean },
) {
  const enabled = options?.enabled ?? !!userId;
  const keepPrevious = options?.keepPrevious ?? false;
  return useQuery(userStatsQueryOptions(userId, sport, enabled, keepPrevious));
}
