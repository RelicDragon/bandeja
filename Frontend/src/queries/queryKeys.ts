import { format } from 'date-fns';
import type { Sport } from '@shared/sport';

export interface AvailableGamesFilterParams {
  startDate?: Date;
  endDate?: Date;
  sport?: string;
  includeLeagues?: boolean;
  showPrivateGames?: boolean;
  cityId?: string;
  isAdmin?: boolean;
}

export function buildAvailableGamesFilterHash(params: AvailableGamesFilterParams): string {
  const privateFlag = params.isAdmin && params.showPrivateGames ? '1' : '0';
  const sport = params.sport ?? 'primary';
  const cityId = params.cityId ?? 'no-city';
  const includeLeagues = String(!!params.includeLeagues);

  if (params.startDate && params.endDate) {
    return `${cityId}-${format(params.startDate, 'yyyy-MM-dd')}-${format(params.endDate, 'yyyy-MM-dd')}-${includeLeagues}-${sport}-${privateFlag}`;
  }
  return `${cityId}-${includeLeagues}-${sport}-${privateFlag}`;
}

export const queryKeys = {
  userStats: (userId: string, sport?: Sport) =>
    ['users', 'stats', userId, sport ?? 'default'] as const,
  games: {
    all: ['games'] as const,
    my: (userId: string) => ['games', 'my', userId] as const,
    available: (filterHash: string) => ['games', 'available', filterHash] as const,
    past: (userId: string) => ['games', 'past', userId] as const,
  },
  userGameNotes: {
    all: ['userGameNotes'] as const,
    detail: (gameId: string) => ['userGameNotes', gameId] as const,
  },
};
