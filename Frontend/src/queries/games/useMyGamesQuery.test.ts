import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { Game, Invite } from '@/types';

const { getMyTabData } = vi.hoisted(() => ({
  getMyTabData: vi.fn(),
}));

vi.mock('@/api/me', () => ({
  getMyTabData: (...args: unknown[]) => getMyTabData(...args),
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

  it('does not fetch when userId is undefined', () => {
    const options = myGamesQueryOptions(undefined);
    expect(options.enabled).toBe(false);
  });
});
