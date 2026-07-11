import { queryOptions, useQuery } from '@tanstack/react-query';
import type { Game, Invite } from '@/types';
import { getMyTabData, getMyTabDataFallback } from '@/api/me';
import { queryKeys } from '../queryKeys';
import { GAMES_LIST_STALE_TIME } from './constants';
import { sortGames } from './sortGames';

export interface MyGamesData {
  games: Game[];
  invites: Invite[];
  unreadCounts: Record<string, number>;
}

async function fetchMyGamesData(userId: string): Promise<MyGamesData> {
  try {
    const { games: myGames, invites: invitesData, unreadCounts } = await getMyTabData({
      userId,
      useCache: true,
    });
    return {
      games: sortGames([...(myGames || [])]),
      invites: invitesData ?? [],
      unreadCounts: unreadCounts ?? {},
    };
  } catch (error) {
    console.warn('[useMyGamesQuery] Primary My Tab fetch failed, using fallback', error);
    const fallback = await getMyTabDataFallback(userId);
    return {
      games: sortGames([...(fallback.games || [])]),
      invites: fallback.invites ?? [],
      unreadCounts: fallback.unreadCounts ?? {},
    };
  }
}

export function myGamesQueryOptions(userId: string | undefined, enabled = true) {
  const isEnabled = enabled && !!userId;
  return queryOptions({
    queryKey: queryKeys.games.my(userId ?? ''),
    queryFn: async (): Promise<MyGamesData> => fetchMyGamesData(userId!),
    staleTime: GAMES_LIST_STALE_TIME,
    enabled: isEnabled,
    retry: (failureCount, error: { response?: { status?: number } }) => {
      const status = error?.response?.status;
      if (typeof status === 'number' && status >= 400 && status < 500) {
        return false;
      }
      return failureCount < 2;
    },
    refetchOnMount: (query) => {
      const data = query.state.data as MyGamesData | undefined;
      if (!data) return true;
      if (data.games.length === 0 && data.invites.length === 0) return 'always';
      return query.isStale();
    },
  });
}

export function useMyGamesQuery(
  userId: string | undefined,
  options?: { enabled?: boolean },
) {
  const enabled = options?.enabled ?? !!userId;
  return useQuery(myGamesQueryOptions(userId, enabled));
}
