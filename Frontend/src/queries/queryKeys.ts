import type { Sport } from '@shared/sport';

export const queryKeys = {
  userStats: (userId: string, sport?: Sport) =>
    ['users', 'stats', userId, sport ?? 'default'] as const,
};
