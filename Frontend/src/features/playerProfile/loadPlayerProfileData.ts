import { usersApi, type UserStats } from '@/api/users';
import { blockedUsersApi } from '@/api/blockedUsers';
import type { Sport } from '@shared/sport';

export interface PlayerProfileData {
  stats: UserStats;
  isBlocked: boolean;
}

export async function loadPlayerProfileData(
  playerId: string,
  levelSport: Sport | undefined,
  viewerId: string | undefined,
): Promise<PlayerProfileData> {
  const statsResponse = await usersApi.getUserStats(playerId, levelSport);
  let isBlocked = false;
  if (viewerId && viewerId !== playerId) {
    isBlocked = await blockedUsersApi.checkIfUserBlocked(playerId);
  }
  return { stats: statsResponse.data, isBlocked };
}
