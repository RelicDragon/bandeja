import { queryOptions, useQuery } from '@tanstack/react-query';
import { gamesApi } from '@/api';
import type { Game, Invite } from '@/types';
import { queryKeys } from '../queryKeys';
import { GAMES_LIST_STALE_TIME } from './constants';
import { sortGames } from './sortGames';

export interface MyGamesData {
  games: Game[];
  invites: Invite[];
}

export function myGamesQueryOptions(userId: string | undefined, enabled = true) {
  const isEnabled = enabled && !!userId;
  return queryOptions({
    queryKey: queryKeys.games.my(userId ?? ''),
    queryFn: async (): Promise<MyGamesData> => {
      const response = await gamesApi.getMyGamesWithUnread();
      const { games: myGames, invites: invitesData } = response.data;
      return {
        games: sortGames([...(myGames || [])]),
        invites: invitesData ?? [],
      };
    },
    staleTime: GAMES_LIST_STALE_TIME,
    enabled: isEnabled,
  });
}

export function useMyGamesQuery(
  userId: string | undefined,
  options?: { enabled?: boolean },
) {
  const enabled = options?.enabled ?? !!userId;
  return useQuery(myGamesQueryOptions(userId, enabled));
}
