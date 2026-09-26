// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { UserTeam, UserTeamMembership } from '@/types';

vi.mock('@/store/authStore', () => {
  const state = { user: { id: 'user-1' } };
  return {
    useAuthStore: Object.assign((selector: (s: typeof state) => unknown) => selector(state), {
      getState: () => state,
    }),
  };
});

// Keep the one-shot bootstrap idle; this suite covers the fetch subscription.
vi.mock('@/queries/games/useMyGamesQuery', () => ({
  useMyGamesQuery: () => ({ isPending: true }),
}));

vi.mock('@/api/userTeams', () => ({
  userTeamsApi: { getMine: vi.fn(), getMemberships: vi.fn() },
}));

import { useUserTeamsBootstrap } from './useUserTeamsBootstrap';
import { useUserTeamsStore } from '@/store/userTeamsStore';
import { queryKeys } from '@/queries/queryKeys';

function team(id: string): UserTeam {
  return { id, ownerId: 'user-1', members: [] } as unknown as UserTeam;
}

function membership(t: UserTeam): UserTeamMembership {
  return { id: `m-${t.id}`, teamId: t.id, userId: 'user-1', team: t } as unknown as UserTeamMembership;
}

function myTab(teams: UserTeam[]) {
  return { games: [], invites: [], unreadCounts: {}, teams, memberships: teams.map(membership) };
}

function Probe() {
  useUserTeamsBootstrap();
  return null;
}

const myTabKey = queryKeys.games.my('user-1', 'en');
const storeTeamIds = () => useUserTeamsStore.getState().teams.map((t) => t.id);

let root: Root;
let client: QueryClient;

describe('useUserTeamsBootstrap My-tab follow', () => {
  beforeEach(async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    useUserTeamsStore.setState({ teams: [], memberships: [], isLoading: false, lastFetchedAt: null });
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    root = createRoot(document.createElement('div'));
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <Probe />
        </QueryClientProvider>,
      );
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    client.clear();
  });

  it('drops a team deleted while the socket was down on the next My-tab fetch', async () => {
    await act(async () => {
      await client.fetchQuery({ queryKey: myTabKey, queryFn: async () => myTab([team('t1'), team('t2')]) });
    });
    expect(storeTeamIds()).toEqual(['t1', 't2']);

    await act(async () => {
      await client.fetchQuery({ queryKey: myTabKey, queryFn: async () => myTab([team('t2')]) });
    });
    expect(storeTeamIds()).toEqual(['t2']);
    expect(useUserTeamsStore.getState().memberships.map((m) => m.teamId)).toEqual(['t2']);
  });

  it('ignores manual cache patches and other users', async () => {
    useUserTeamsStore.setState({ teams: [team('t1')], memberships: [membership(team('t1'))] });

    act(() => {
      client.setQueryData(myTabKey, myTab([team('stale')]));
    });
    await act(async () => {
      await client.fetchQuery({
        queryKey: queryKeys.games.my('user-2', 'en'),
        queryFn: async () => myTab([team('other')]),
      });
    });

    expect(storeTeamIds()).toEqual(['t1']);
  });
});
