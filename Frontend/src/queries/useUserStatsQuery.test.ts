import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { UserStats } from '@/api/users';

const { getUserStats } = vi.hoisted(() => ({
  getUserStats: vi.fn(),
}));

vi.mock('@/api/users', () => ({
  usersApi: {
    getUserStats: (...args: unknown[]) => getUserStats(...args),
  },
}));

import { userStatsQueryOptions } from './useUserStatsQuery';

function sampleStats(sport?: string): UserStats {
  return {
    user: { id: 'player-1', firstName: 'Test', lastName: 'User' },
    followersCount: 0,
    sport,
  } as UserStats;
}

function createTestClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
}

describe('useUserStatsQuery', () => {
  beforeEach(() => {
    getUserStats.mockReset();
    getUserStats.mockResolvedValue({ data: sampleStats('PADEL') });
  });

  it('fetches once per key within stale window', async () => {
    const client = createTestClient();
    const options = userStatsQueryOptions('player-1', 'PADEL');

    await client.fetchQuery(options);
    await client.fetchQuery(options);

    expect(getUserStats).toHaveBeenCalledTimes(1);
    expect(getUserStats).toHaveBeenCalledWith('player-1', 'PADEL');
  });

  it('refetches when sport changes', async () => {
    const client = createTestClient();
    getUserStats
      .mockResolvedValueOnce({ data: sampleStats('PADEL') })
      .mockResolvedValueOnce({ data: sampleStats('TENNIS') });

    const padel = await client.fetchQuery(userStatsQueryOptions('player-1', 'PADEL'));
    const tennis = await client.fetchQuery(userStatsQueryOptions('player-1', 'TENNIS'));

    expect(getUserStats).toHaveBeenCalledTimes(2);
    expect(padel.sport).toBe('PADEL');
    expect(tennis.sport).toBe('TENNIS');
  });

  it('does not fetch when userId is undefined', () => {
    const options = userStatsQueryOptions(undefined, 'PADEL');

    expect(options.enabled).toBe(false);
  });
});
