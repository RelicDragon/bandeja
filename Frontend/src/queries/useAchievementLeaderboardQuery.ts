import { useQuery } from '@tanstack/react-query';
import type { AchievementLeaderboardFamily } from '@shared/achievements';
import { rankingApi } from '@/api/ranking';
import type { LeaderboardGenderFilter } from '@/components/leaderboard/leaderboardGender';
import { queryKeys } from '@/queries/queryKeys';

function rankingErrorData(error: unknown): {
  code?: string;
  retryAfterSeconds?: number;
} {
  return (
    error as {
      response?: {
        data?: {
          code?: string;
          retryAfterSeconds?: number;
        };
      };
    }
  )?.response?.data ?? {};
}

export function useAchievementLeaderboardQuery(params: {
  family: AchievementLeaderboardFamily | null;
  scope: 'city' | 'global';
  gender: LeaderboardGenderFilter;
}) {
  return useQuery({
    queryKey: params.family
      ? queryKeys.achievementLeaderboard(params.family, params.scope, params.gender)
      : ['rankings', 'achievements', 'unselected'],
    queryFn: () =>
      rankingApi.getAchievementLeaderboardContext(
        params.family!,
        params.scope,
        params.gender,
      ),
    enabled: params.family != null,
    staleTime: 2 * 60 * 1000,
    retry: (failureCount, error) =>
      rankingErrorData(error).code !== 'ranking.achievementStatsRepairFailed' &&
      failureCount < 3,
    retryDelay: (attemptIndex, error) => {
      const retryAfterSeconds = rankingErrorData(error).retryAfterSeconds;
      if (
        typeof retryAfterSeconds === 'number' &&
        Number.isFinite(retryAfterSeconds)
      ) {
        return Math.max(250, retryAfterSeconds * 1000);
      }
      return Math.min(1000 * 2 ** attemptIndex, 30_000);
    },
  });
}
