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

vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/components/CityMap/useDebounce', () => ({
  useDebounce: <T,>(value: T) => value,
}));

vi.mock('@/components/ui/Dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
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

import { PlayerListModal } from './PlayerListModal';

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

  it('keeps the search field mounted while the first list load is in flight', async () => {
    let resolveFetch: (value: ReturnType<typeof emptyFetchResult>) => void = () => {};
    fetchPlayers.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    await act(async () => {
      root!.render(<PlayerListModal onClose={() => {}} />);
    });

    const input = container.querySelector('[data-testid="player-invite-search"]');
    expect(input).toBeInstanceOf(HTMLInputElement);

    await act(async () => {
      resolveFetch(emptyFetchResult());
    });
  });

  it('does not remount the search field after each keypress', async () => {
    fetchPlayers.mockResolvedValue(emptyFetchResult());

    await act(async () => {
      root!.render(<PlayerListModal onClose={() => {}} />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    const input = container.querySelector('[data-testid="player-invite-search"]');
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

    const after = container.querySelector('[data-testid="player-invite-search"]');
    expect(after).toBe(search);
    expect(document.activeElement).toBe(search);
    expect(search.value).toBe('ab');
  });
});
