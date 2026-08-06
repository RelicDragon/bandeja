import { queryOptions, useQuery } from '@tanstack/react-query';
import { favoritesApi } from '@/api/favorites';
import type { BasicUser } from '@/types';
import { queryKeys } from './queryKeys';

export interface SocialConnectionsData {
  following: BasicUser[];
  followers: BasicUser[];
  followingCount: number;
  followersCount: number;
  hasConnections: boolean;
}

const SOCIAL_CONNECTIONS_STALE_TIME = 60 * 1000;

export function socialConnectionsQueryOptions(userId: string | undefined, enabled = true) {
  const isEnabled = enabled && !!userId;
  return queryOptions({
    queryKey: queryKeys.socialConnections(userId ?? ''),
    queryFn: async (): Promise<SocialConnectionsData> => {
      try {
        const [following, followers] = await Promise.all([
          favoritesApi.getFollowing(),
          favoritesApi.getFollowers(),
        ]);
        return {
          following,
          followers,
          followingCount: following.length,
          followersCount: followers.length,
          hasConnections: following.length > 0 || followers.length > 0,
        };
      } catch (error) {
        console.error('Failed to fetch social connections:', error);
        return {
          following: [],
          followers: [],
          followingCount: 0,
          followersCount: 0,
          hasConnections: false,
        };
      }
    },
    staleTime: SOCIAL_CONNECTIONS_STALE_TIME,
    enabled: isEnabled,
  });
}

export function useSocialConnectionsQuery(
  userId: string | undefined,
  options?: { enabled?: boolean }
) {
  const enabled = options?.enabled ?? !!userId;
  return useQuery(socialConnectionsQueryOptions(userId, enabled));
}
