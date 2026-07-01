import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Invite } from '@/types';

const apiPost = vi.fn();
const clearMyTabCache = vi.fn();
const getMyTabData = vi.fn();

vi.mock('./axios', () => ({
  default: {
    post: (...args: unknown[]) => apiPost(...args),
    get: vi.fn(),
  },
}));

vi.mock('@/api/me', () => ({
  clearMyTabCache: () => clearMyTabCache(),
  getMyTabData: (...args: unknown[]) => getMyTabData(...args),
}));

vi.mock('@/store/authStore', () => ({
  useAuthStore: {
    getState: () => ({ user: { id: 'user-1' } }),
  },
}));

import { queryClient } from '@/queries/queryClient';
import { queryKeys } from '@/queries/queryKeys';
import type { MyGamesData } from '@/queries/games/useMyGamesQuery';
import { invitesApi } from './invites';

function sampleInvite(id: string): Invite {
  return { id, game: { id: 'game-1' } } as Invite;
}

describe('invitesApi my-tab cache sync', () => {
  beforeEach(() => {
    apiPost.mockReset();
    clearMyTabCache.mockReset();
    getMyTabData.mockReset();
    queryClient.clear();
  });

  it('accept removes invite from my games cache (game-page accept → back to My tab)', async () => {
    queryClient.setQueryData<MyGamesData>(queryKeys.games.my('user-1'), {
      games: [],
      invites: [sampleInvite('inv-1')],
      unreadCounts: {},
    });
    apiPost.mockResolvedValue({ data: { success: true, message: 'invites.acceptedSuccessfully' } });

    await invitesApi.accept('inv-1');

    expect(clearMyTabCache).toHaveBeenCalledTimes(1);
    const cached = queryClient.getQueryData<MyGamesData>(queryKeys.games.my('user-1'));
    expect(cached?.invites).toEqual([]);
  });

  it('decline removes invite from my games cache', async () => {
    queryClient.setQueryData<MyGamesData>(queryKeys.games.my('user-1'), {
      games: [],
      invites: [sampleInvite('inv-1')],
      unreadCounts: {},
    });
    apiPost.mockResolvedValue({ data: { success: true, message: 'invites.declinedSuccessfully' } });

    await invitesApi.decline('inv-1');

    expect(clearMyTabCache).toHaveBeenCalledTimes(1);
    const cached = queryClient.getQueryData<MyGamesData>(queryKeys.games.my('user-1'));
    expect(cached?.invites).toEqual([]);
  });

  it('does not sync cache when accept fails', async () => {
    queryClient.setQueryData<MyGamesData>(queryKeys.games.my('user-1'), {
      games: [],
      invites: [sampleInvite('inv-1')],
      unreadCounts: {},
    });
    apiPost.mockRejectedValue({ response: { status: 404, data: { message: 'errors.invites.notFound' } } });

    await expect(invitesApi.accept('inv-1')).rejects.toBeTruthy();

    expect(clearMyTabCache).not.toHaveBeenCalled();
    expect(queryClient.getQueryData<MyGamesData>(queryKeys.games.my('user-1'))?.invites).toHaveLength(1);
  });

  it('forced refetch after accept cannot restore invite from stale local cache', async () => {
    queryClient.setQueryData<MyGamesData>(queryKeys.games.my('user-1'), {
      games: [],
      invites: [sampleInvite('inv-1')],
      unreadCounts: {},
    });
    apiPost.mockResolvedValue({ data: { success: true, message: 'invites.acceptedSuccessfully' } });
    getMyTabData.mockResolvedValue({
      games: [{ id: 'game-1', startTime: '2026-07-02T10:00:00Z' }],
      invites: [],
      teams: [],
      unreadCounts: {},
    });

    await invitesApi.accept('inv-1');

    clearMyTabCache.mockClear();
    await queryClient.invalidateQueries({ queryKey: queryKeys.games.my('user-1') });
    clearMyTabCache();
    const result = await queryClient.fetchQuery({
      queryKey: queryKeys.games.my('user-1'),
      queryFn: async () => {
        const { games, invites, unreadCounts } = await getMyTabData({ useCache: true });
        return { games, invites: invites ?? [], unreadCounts: unreadCounts ?? {} };
      },
    });

    expect(clearMyTabCache).toHaveBeenCalled();
    expect(getMyTabData).toHaveBeenCalledWith({ useCache: true });
    expect(result.invites).toEqual([]);
  });
});
