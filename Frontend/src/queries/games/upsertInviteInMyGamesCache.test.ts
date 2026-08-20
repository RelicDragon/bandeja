import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { Invite } from '@/types';

const { clearMyTabCache } = vi.hoisted(() => ({
  clearMyTabCache: vi.fn(),
}));

vi.mock('@/api/me', () => ({
  clearMyTabCache: () => clearMyTabCache(),
}));

import { upsertInviteInMyGamesCache } from './upsertInviteInMyGamesCache';
import { queryKeys } from '../queryKeys';
import type { MyGamesData } from './useMyGamesQuery';

function sampleInvite(id: string, extras?: Partial<Invite>): Invite {
  return { id, ...extras } as Invite;
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

describe('upsertInviteInMyGamesCache', () => {
  beforeEach(() => {
    clearMyTabCache.mockReset();
  });

  it('prepends a new invite so Home can restore after a slot opens', () => {
    const client = createTestClient({
      games: [],
      invites: [sampleInvite('inv-1')],
      unreadCounts: {},
    });

    upsertInviteInMyGamesCache(client, 'user-1', sampleInvite('inv-2'));

    expect(clearMyTabCache).toHaveBeenCalledTimes(1);
    const data = client.getQueryData<MyGamesData>(queryKeys.games.my('user-1'));
    expect(data?.invites.map((inv) => inv.id)).toEqual(['inv-2', 'inv-1']);
  });

  it('replaces an existing invite with the same id', () => {
    const client = createTestClient({
      games: [],
      invites: [sampleInvite('inv-1', { message: 'old' })],
      unreadCounts: {},
    });

    upsertInviteInMyGamesCache(client, 'user-1', sampleInvite('inv-1', { message: 'fresh' }));

    const data = client.getQueryData<MyGamesData>(queryKeys.games.my('user-1'));
    expect(data?.invites).toHaveLength(1);
    expect(data?.invites[0].message).toBe('fresh');
  });

  it('no-ops when userId is missing', () => {
    const client = createTestClient({
      games: [],
      invites: [sampleInvite('inv-1')],
      unreadCounts: {},
    });

    upsertInviteInMyGamesCache(client, undefined, sampleInvite('inv-2'));

    expect(clearMyTabCache).not.toHaveBeenCalled();
    expect(client.getQueryData<MyGamesData>(queryKeys.games.my('user-1'))?.invites).toHaveLength(1);
  });
});
