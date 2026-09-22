// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(
  globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;

const fetchPlayers = vi.hoisted(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
  return vi.fn();
});

vi.mock('react-i18next', () => {
  const t = (key: string) => key;
  return {
    useTranslation: () => ({ t, i18n: { language: 'en' } }),
    initReactI18next: { type: '3rdParty', init: () => {} },
  };
});

vi.mock('@/utils/audioPlaybackRateStorage', () => ({
  getStoredAudioPlaybackRate: () => Promise.resolve(1),
  setStoredAudioPlaybackRate: () => Promise.resolve(),
}));

vi.mock('@/hooks/usePlayerCardModal', () => ({
  usePlayerCardModal: () => ({ openPlayerCard: vi.fn(), closePlayerCard: vi.fn() }),
}));

vi.mock('@/features/collection/useEquippedGoods', () => ({
  useFrameClass: () => null,
  useNameColorClass: () => null,
}));

vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/components/CityMap/useDebounce', () => ({
  useDebounce: <T,>(value: T) => value,
}));

vi.mock('@/store/playersStore', () => {
  const state = {
    invitableMaxSocial: 5,
    getUserMetadata: () => undefined,
    fetchPlayers,
  };
  const usePlayersStore = (selector: (s: typeof state) => unknown) => selector(state);
  usePlayersStore.getState = () => state;
  return { usePlayersStore };
});

vi.mock('@/store/userTeamsStore', () => ({
  useUserTeamsStore: {
    getState: () => ({
      refreshAll: vi.fn().mockResolvedValue(undefined),
      teams: [],
      memberships: [],
    }),
  },
}));

vi.mock('@/store/favoritesStore', () => ({
  useFavoritesStore: (selector: (s: { isFavorite: () => boolean }) => unknown) =>
    selector({ isFavorite: () => false }),
}));

vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector: (s: { user: null }) => unknown) => selector({ user: null }),
}));

vi.mock('@/hooks/useResolvedBrowseCity', () => ({
  useResolvedBrowseCity: () => ({
    cityId: undefined,
    homeCityId: undefined,
    name: '',
    country: '',
    isAway: false,
    hasCity: false,
  }),
}));

vi.mock('@/store/browseCityStore', () => ({
  useBrowseCityStore: Object.assign(
    (selector: (s: { recents: string[] }) => unknown) => selector({ recents: [] }),
    { getState: () => ({ setCityId: vi.fn() }) },
  ),
}));

vi.mock('@/api/userTeams', () => ({
  userTeamsApi: { getForPlayerInvite: vi.fn().mockResolvedValue([]) },
}));

vi.mock('@/components/playerInvite/useInviteLookingPool', () => ({
  useInviteLookingPool: () => ({
    members: [],
    isLoading: false,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
    lookingCount: 0,
    greatFitCount: 0,
  }),
}));

vi.mock('@/contexts/SportLevelContext', () => ({
  SportLevelProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { BasicUser } from '@/types';
import { PlayerListModal } from './PlayerListModal';

function renderModal() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <PlayerListModal onClose={() => {}} />
    </QueryClientProvider>
  );
}

function emptyFetchResult() {
  return Object.assign([], { nearby: [], busyUserIds: [] });
}

describe('PlayerListModal search focus', () => {
  let root: Root | null = null;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    fetchPlayers.mockReset();
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container.remove();
  });

  it('keeps the same search node focused across the initial list load', async () => {
    let resolveFetch: (value: ReturnType<typeof emptyFetchResult>) => void = () => {};
    fetchPlayers.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    await act(async () => {
      root!.render(renderModal());
    });

    const input = document.querySelector('[data-testid="player-invite-search"]');
    expect(input).toBeInstanceOf(HTMLInputElement);
    const search = input as HTMLInputElement;
    expect(document.querySelector('.animate-spin')).not.toBeNull();

    await act(async () => {
      search.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(search, 'ab');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await act(async () => {
      resolveFetch(emptyFetchResult());
    });

    const after = document.querySelector('[data-testid="player-invite-search"]');
    expect(after).toBe(search);
    expect(document.activeElement).toBe(search);
    expect(search.value).toBe('ab');
  });

  it('does not remount the search field after each keypress', async () => {
    fetchPlayers.mockResolvedValue(emptyFetchResult());

    await act(async () => {
      root!.render(renderModal());
    });
    await act(async () => {
      await Promise.resolve();
    });

    const input = document.querySelector('[data-testid="player-invite-search"]');
    expect(input).toBeInstanceOf(HTMLInputElement);
    const search = input as HTMLInputElement;

    await act(async () => {
      search.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(search, 'ab');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    const after = document.querySelector('[data-testid="player-invite-search"]');
    expect(after).toBe(search);
    expect(document.activeElement).toBe(search);
    expect(search.value).toBe('ab');
  });

  it('keeps focus when a delayed search response mounts real player avatars', async () => {
    fetchPlayers.mockResolvedValueOnce(emptyFetchResult());
    await act(async () => { root!.render(renderModal()); });
    const search = document.querySelector<HTMLInputElement>('[data-testid="player-invite-search"]')!;
    let resolveSearch!: (players: BasicUser[]) => void;
    fetchPlayers.mockImplementation(() => new Promise<BasicUser[]>((resolve) => { resolveSearch = resolve; }));
    await act(async () => {
      search.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(search, 'ab');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    // Let the input's keystroke focus-restoration frame finish before the response.
    await act(async () => { await new Promise((resolve) => requestAnimationFrame(resolve)); });
    await act(async () => {
      resolveSearch([{
        id: 'abby', firstName: 'Abby', level: 3, socialLevel: 1,
        gender: 'FEMALE', approvedLevel: false, isTrainer: false,
      }]);
    });

    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Abby');
    expect(document.activeElement).toBe(search);
    expect(search.value).toBe('ab');
  });
});
