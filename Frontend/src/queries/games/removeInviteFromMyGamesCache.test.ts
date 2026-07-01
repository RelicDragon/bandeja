import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { Invite } from '@/types';

const { clearMyTabCache } = vi.hoisted(() => ({
  clearMyTabCache: vi.fn(),
}));

vi.mock('@/api/me', () => ({
  clearMyTabCache: () => clearMyTabCache(),
}));

import { removeInviteFromMyGamesCache } from './removeInviteFromMyGamesCache';
import { queryKeys } from '../queryKeys';
import type { MyGamesData } from './useMyGamesQuery';

function sampleInvite(id: string): Invite {
  return { id } as Invite;
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

describe('removeInviteFromMyGamesCache', () => {
  beforeEach(() => {
    clearMyTabCache.mockReset();
  });

  it('removes invite from my games cache and clears local my-tab cache', () => {
    const client = createTestClient({
      games: [],
      invites: [sampleInvite('inv-1'), sampleInvite('inv-2')],
      unreadCounts: {},
    });

    removeInviteFromMyGamesCache(client, 'user-1', 'inv-1');

    expect(clearMyTabCache).toHaveBeenCalledTimes(1);
    const data = client.getQueryData<MyGamesData>(queryKeys.games.my('user-1'));
    expect(data?.invites.map((inv) => inv.id)).toEqual(['inv-2']);
  });

  it('no-ops when userId is missing', () => {
    const client = createTestClient({
      games: [],
      invites: [sampleInvite('inv-1')],
      unreadCounts: {},
    });

    removeInviteFromMyGamesCache(client, undefined, 'inv-1');

    expect(clearMyTabCache).not.toHaveBeenCalled();
    expect(client.getQueryData<MyGamesData>(queryKeys.games.my('user-1'))?.invites).toHaveLength(1);
  });
});
