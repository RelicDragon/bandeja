// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Invite } from '@/types';
import { queryKeys } from '@/queries/queryKeys';
import { useAuthStore } from '@/store/authStore';
import { useHeaderStore } from '@/store/headerStore';
import { usePendingInvitesBadgeCount } from './usePendingInvitesBadgeCount';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/utils/gameText/appUiLocale', () => ({
  getAppUiLocaleForGameText: () => 'en',
}));

const playing = (n: number) => Array.from({ length: n }, () => ({ status: 'PLAYING' }));
const openInvite = { id: 'open', status: 'PENDING', game: { maxParticipants: 4, participants: playing(3) } };
const fullInvite = { id: 'full', status: 'PENDING', game: { maxParticipants: 4, participants: playing(4) } };

function Probe() {
  return <span data-testid="count">{usePendingInvitesBadgeCount()}</span>;
}

describe('usePendingInvitesBadgeCount', () => {
  let container: HTMLDivElement;
  let root: Root;
  let client: QueryClient;

  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    useAuthStore.setState({
      isAuthenticated: true,
      user: { id: 'user-1' } as ReturnType<typeof useAuthStore.getState>['user'],
    });
    useHeaderStore.setState({ pendingInvites: 7, decrementedInviteIds: new Set() });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    client.clear();
  });

  const render = () =>
    act(() => {
      root.render(
        <QueryClientProvider client={client}>
          <Probe />
        </QueryClientProvider>,
      );
    });
  const shown = () => container.querySelector('[data-testid="count"]')?.textContent;

  it('falls back to the store before the my-tab query has data', () => {
    render();
    expect(shown()).toBe('7');
  });

  it('counts only invites with a free seat, from the active-locale query', () => {
    client.setQueryData(queryKeys.games.my('user-1', 'ru'), {
      games: [],
      invites: [openInvite, { ...openInvite, id: 'stale' }] as unknown as Invite[],
      unreadCounts: {},
    });
    client.setQueryData(queryKeys.games.my('user-1', 'en'), {
      games: [],
      invites: [openInvite, fullInvite] as unknown as Invite[],
      unreadCounts: {},
    });
    render();
    expect(shown()).toBe('1');
  });

  it('drops to zero when the only invite game fills up', async () => {
    client.setQueryData(queryKeys.games.my('user-1', 'en'), {
      games: [],
      invites: [openInvite] as unknown as Invite[],
      unreadCounts: {},
    });
    render();
    expect(shown()).toBe('1');
    // React Query batches observer notifications onto a later tick.
    await act(async () => {
      client.setQueryData(queryKeys.games.my('user-1', 'en'), {
        games: [],
        invites: [{ ...openInvite, game: fullInvite.game }] as unknown as Invite[],
        unreadCounts: {},
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(shown()).toBe('0');
  });
});
