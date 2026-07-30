import { useQuery } from '@tanstack/react-query';
import { usersApi } from '@/api/users';
import { queryKeys } from './queryKeys';

export function useFollowingAchievementEarnersQuery(
  viewerUserId: string | undefined,
  definitionId: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: queryKeys.followingAchievementEarners(viewerUserId ?? '', definitionId),
    queryFn: () => usersApi.getFollowingAchievementEarners(definitionId),
    enabled: enabled && Boolean(viewerUserId) && Boolean(definitionId),
    staleTime: 30 * 1000,
  });
}
