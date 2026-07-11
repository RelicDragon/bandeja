import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUserTeamsStore } from '@/store/userTeamsStore';
import { queryClient } from '@/queries/queryClient';
import { queryKeys } from '@/queries/queryKeys';
import type { UserTeam, UserTeamMembership } from '@/types';

const getMine = vi.fn();
const getMemberships = vi.fn();

vi.mock('@/api/userTeams', () => ({
  userTeamsApi: {
    getMine: (...args: unknown[]) => getMine(...args),
    getMemberships: (...args: unknown[]) => getMemberships(...args),
  },
}));

vi.mock('@/store/authStore', () => ({
  useAuthStore: {
    getState: () => ({ user: { id: 'user-1' } }),
  },
}));

describe('userTeamsStore my-tab hydration', () => {
  beforeEach(() => {
    queryClient.clear();
    getMine.mockReset();
    getMemberships.mockReset();
    useUserTeamsStore.setState({
      teams: [],
      memberships: [],
      isLoading: false,
      lastFetchedAt: null,
    });
  });

  it('hydrates from my-tab cache without network when memberships are present', async () => {
    const ownedTeam = { id: 't1', ownerId: 'user-1', members: [] } as UserTeam;
    const memberships = [{ id: 'm1', teamId: 't1', userId: 'user-1', team: ownedTeam }] as UserTeamMembership[];

    queryClient.setQueryData(queryKeys.games.my('user-1'), {
      games: [],
      invites: [],
      unreadCounts: {},
      teams: [ownedTeam],
      memberships,
    });

    const hydrated = useUserTeamsStore.getState().hydrateFromMyTabCache(queryClient, 'user-1');
    expect(hydrated).toBe(true);

    const refreshed = await useUserTeamsStore.getState().refreshAll();
    expect(refreshed).toBe(true);
    expect(getMine).not.toHaveBeenCalled();
    expect(getMemberships).not.toHaveBeenCalled();
    expect(useUserTeamsStore.getState().teams).toEqual([ownedTeam]);
    expect(useUserTeamsStore.getState().memberships).toEqual(memberships);
  });

  it('falls back to network when memberships snapshot is null', async () => {
    const ownedTeam = { id: 't1', ownerId: 'user-1', members: [] } as UserTeam;

    queryClient.setQueryData(queryKeys.games.my('user-1'), {
      games: [],
      invites: [],
      unreadCounts: {},
      teams: [ownedTeam],
      memberships: null,
    });

    getMine.mockResolvedValue([ownedTeam]);
    getMemberships.mockResolvedValue([]);

    const hydrated = useUserTeamsStore.getState().hydrateFromMyTabCache(queryClient, 'user-1');
    expect(hydrated).toBe(false);

    await useUserTeamsStore.getState().refreshAll();

    expect(getMine).toHaveBeenCalledTimes(1);
    expect(getMemberships).toHaveBeenCalledTimes(1);
  });

  it('forces network refresh when requested', async () => {
    getMine.mockResolvedValue([]);
    getMemberships.mockResolvedValue([]);

    await useUserTeamsStore.getState().refreshAll({ force: true });

    expect(getMine).toHaveBeenCalledTimes(1);
    expect(getMemberships).toHaveBeenCalledTimes(1);
  });
});
