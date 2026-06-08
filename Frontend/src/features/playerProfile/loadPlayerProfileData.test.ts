import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { UserStats } from '@/api/users';

const { getUserStats, checkIfUserBlocked } = vi.hoisted(() => ({
  getUserStats: vi.fn(),
  checkIfUserBlocked: vi.fn(),
}));

vi.mock('@/api/users', () => ({
  usersApi: {
    getUserStats: (...args: unknown[]) => getUserStats(...args),
  },
}));

vi.mock('@/api/blockedUsers', () => ({
  blockedUsersApi: {
    checkIfUserBlocked: (...args: unknown[]) => checkIfUserBlocked(...args),
  },
}));

import { loadPlayerProfileData } from './loadPlayerProfileData';

function createTestClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
}

function sampleStats(sport?: string): UserStats {
  return {
    user: { id: 'player-1', firstName: 'Test', lastName: 'User' },
    followersCount: 0,
    sport,
  } as UserStats;
}

describe('loadPlayerProfileData', () => {
  let client: QueryClient;

  beforeEach(() => {
    client = createTestClient();
    getUserStats.mockReset();
    checkIfUserBlocked.mockReset();
    checkIfUserBlocked.mockResolvedValue(false);
  });

  it('loads stats for the requested player', async () => {
    getUserStats.mockResolvedValue({ data: sampleStats('PADEL') });

    const result = await loadPlayerProfileData('player-1', 'PADEL', 'viewer-1', client);

    expect(getUserStats).toHaveBeenCalledWith('player-1', 'PADEL');
    expect(checkIfUserBlocked).toHaveBeenCalledWith('player-1');
    expect(result.stats.user.id).toBe('player-1');
    expect(result.isBlocked).toBe(false);
  });

  it('refetches with a new sport when level sport changes', async () => {
    getUserStats
      .mockResolvedValueOnce({ data: sampleStats('PADEL') })
      .mockResolvedValueOnce({ data: sampleStats('TENNIS') });

    const padel = await loadPlayerProfileData('player-1', 'PADEL', 'viewer-1', client);
    const tennis = await loadPlayerProfileData('player-1', 'TENNIS', 'viewer-1', client);

    expect(getUserStats).toHaveBeenNthCalledWith(1, 'player-1', 'PADEL');
    expect(getUserStats).toHaveBeenNthCalledWith(2, 'player-1', 'TENNIS');
    expect(padel.stats.sport).toBe('PADEL');
    expect(tennis.stats.sport).toBe('TENNIS');
  });

  it('skips block check for self profile', async () => {
    getUserStats.mockResolvedValue({ data: sampleStats() });

    const result = await loadPlayerProfileData('player-1', undefined, 'player-1', client);

    expect(checkIfUserBlocked).not.toHaveBeenCalled();
    expect(result.isBlocked).toBe(false);
  });

  it('returns blocked state from API', async () => {
    getUserStats.mockResolvedValue({ data: sampleStats() });
    checkIfUserBlocked.mockResolvedValue(true);

    const result = await loadPlayerProfileData('player-1', undefined, 'viewer-1', client);

    expect(result.isBlocked).toBe(true);
  });

  it('reuses cached stats within stale window', async () => {
    getUserStats.mockResolvedValue({ data: sampleStats('PADEL') });

    await loadPlayerProfileData('player-1', 'PADEL', 'viewer-1', client);
    await loadPlayerProfileData('player-1', 'PADEL', 'viewer-2', client);

    expect(getUserStats).toHaveBeenCalledTimes(1);
  });
});
