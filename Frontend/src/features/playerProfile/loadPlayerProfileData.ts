import type { QueryClient } from '@tanstack/react-query';
import type { UserStats } from '@/api/users';
import { blockedUsersApi } from '@/api/blockedUsers';
import type { Sport } from '@shared/sport';
import { queryClient } from '@/queries/queryClient';
import { userStatsQueryOptions } from '@/queries/useUserStatsQuery';

export interface PlayerProfileData {
  stats: UserStats;
  isBlocked: boolean;
}

export async function loadPlayerProfileData(
  playerId: string,
  levelSport: Sport | undefined,
  viewerId: string | undefined,
  client: QueryClient = queryClient,
): Promise<PlayerProfileData> {
  const stats = await client.fetchQuery(userStatsQueryOptions(playerId, levelSport));
  let isBlocked = false;
  if (viewerId && viewerId !== playerId) {
    isBlocked = await blockedUsersApi.checkIfUserBlocked(playerId);
  }
  return { stats, isBlocked };
}
