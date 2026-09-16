import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { UserTeam, UserTeamMembership } from '@/types';

const { clearMyTabCache } = vi.hoisted(() => ({
  clearMyTabCache: vi.fn(),
}));

vi.mock('@/api/me', () => ({
  clearMyTabCache: (...args: unknown[]) => clearMyTabCache(...args),
}));

import { removeUserTeamFromMyGamesCache } from './removeUserTeamFromMyGamesCache';
import { queryKeys } from '../queryKeys';
import type { MyGamesData } from './useMyGamesQuery';

function sampleTeam(id: string): UserTeam {
  return { id, ownerId: 'user-1', members: [] } as UserTeam;
}

function sampleMembership(teamId: string): UserTeamMembership {
  return { id: `m-${teamId}`, teamId, userId: 'user-1', team: sampleTeam(teamId) } as UserTeamMembership;
}

function createTestClient(initial?: MyGamesData) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  if (initial) {
    client.setQueryData(queryKeys.games.my('user-1'), initial);
  }
  return client;
}

describe('removeUserTeamFromMyGamesCache', () => {
  beforeEach(() => {
    clearMyTabCache.mockReset();
  });

  it('removes team and memberships from my games cache and clears local my-tab cache', () => {
    const client = createTestClient({
      games: [],
      invites: [],
      unreadCounts: {},
      teams: [sampleTeam('t1'), sampleTeam('t2')],
      memberships: [sampleMembership('t1'), sampleMembership('t2')],
    });

    removeUserTeamFromMyGamesCache(client, 'user-1', 't1');

    expect(clearMyTabCache).toHaveBeenCalledWith('user-1');
    const data = client.getQueryData<MyGamesData>(queryKeys.games.my('user-1'));
    expect(data?.teams?.map((t) => t.id)).toEqual(['t2']);
    expect(data?.memberships?.map((m) => m.teamId)).toEqual(['t2']);
  });

  it('no-ops when userId is missing', () => {
    const client = createTestClient({
      games: [],
      invites: [],
      unreadCounts: {},
      teams: [sampleTeam('t1')],
      memberships: [sampleMembership('t1')],
    });

    removeUserTeamFromMyGamesCache(client, undefined, 't1');

    expect(clearMyTabCache).not.toHaveBeenCalled();
    expect(client.getQueryData<MyGamesData>(queryKeys.games.my('user-1'))?.teams).toHaveLength(1);
  });
});
