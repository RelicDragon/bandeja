import { useAuthStore } from '@/store/authStore';
import { useAvailableUpcomingGamesQuery } from '@/queries/games/useAvailableUpcomingGamesQuery';
import type { FindStructuralApiParams } from '@/utils/findStructuralApiParams';

const EVENT_STRUCTURAL: FindStructuralApiParams = {
  entityTypes: 'EVENT',
  mode: 'upcoming',
};

export function useUpcomingCityEvents(options?: { enabled?: boolean; sport?: string }) {
  const user = useAuthStore((state) => state.user);
  const enabled = (options?.enabled ?? true) && Boolean(user?.id);

  return useAvailableUpcomingGamesQuery(
    {
      userId: user?.id,
      sport: options?.sport,
      cityId: user?.currentCity?.id || user?.currentCityId,
      structural: EVENT_STRUCTURAL,
    },
    { enabled },
  );
}
