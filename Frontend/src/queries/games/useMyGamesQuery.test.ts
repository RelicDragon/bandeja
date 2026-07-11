import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { Game, Invite } from '@/types';

const { getMyTabData, getMyTabDataFallback } = vi.hoisted(() => ({
  getMyTabData: vi.fn(),
  getMyTabDataFallback: vi.fn(),
}));

vi.mock('@/api/me', () => ({
  getMyTabData: (...args: unknown[]) => getMyTabData(...args),
  getMyTabDataFallback: (...args: unknown[]) => getMyTabDataFallback(...args),
}));

import { myGamesQueryOptions } from './useMyGamesQuery';
import { queryKeys } from '../queryKeys';

function sampleGame(id: string, startTime: string): Game {
  return { id, startTime } as Game;
}

function sampleInvite(id: string): Invite {
  return { id } as Invite;
}

function createTestClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
}

describe('useMyGamesQuery', () => {
  beforeEach(() => {
    getMyTabData.mockReset();
    getMyTabDataFallback.mockReset();
    getMyTabData.mockResolvedValue({
      games: [sampleGame('g2', '2026-06-02'), sampleGame('g1', '2026-06-01')],
      invites: [sampleInvite('inv-1')],
      teams: [],
      unreadCounts: {},
    });
  });

  it('uses expected query key shape', () => {
    const options = myGamesQueryOptions('user-1');
    expect(options.queryKey).toEqual(queryKeys.games.my('user-1'));
  });

  it('fetches once per key within stale window', async () => {
    const client = createTestClient();
    const options = myGamesQueryOptions('user-1');

    await client.fetchQuery(options);
    await client.fetchQuery(options);

    expect(getMyTabData).toHaveBeenCalledTimes(1);
  });

  it('returns sorted games and invites', async () => {
    const client = createTestClient();
    const result = await client.fetchQuery(myGamesQueryOptions('user-1'));

    expect(result.games.map((g) => g.id)).toEqual(['g2', 'g1']);
    expect(result.invites).toHaveLength(1);
  });

  it('passes userId to getMyTabData', async () => {
    const client = createTestClient();
    await client.fetchQuery(myGamesQueryOptions('user-1'));

    expect(getMyTabData).toHaveBeenCalledWith({
      userId: 'user-1',
      includeStories: true,
      includeBooktime: true,
      useCache: true,
    });
  });

  it('falls back to individual endpoints when getMyTabData throws', async () => {
    getMyTabData.mockRejectedValue(new Error('network down'));
    getMyTabDataFallback.mockResolvedValue({
      games: [sampleGame('g3', '2026-07-12')],
      invites: [],
      teams: [],
      unreadCounts: { g3: 1 },
    });

    const client = createTestClient();
    const result = await client.fetchQuery(myGamesQueryOptions('user-1'));

    expect(getMyTabDataFallback).toHaveBeenCalledWith('user-1');
    expect(result.games.map((g) => g.id)).toEqual(['g3']);
    expect(result.unreadCounts).toEqual({ g3: 1 });
  });

  it('does not fetch when userId is undefined', () => {
    const options = myGamesQueryOptions(undefined);
    expect(options.enabled).toBe(false);
  });
});
