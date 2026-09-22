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
    getUserMetadata: (id: string) =>
      id === 'recent'
        ? { interactionCount: 0, gamesTogetherCount: 5, lastPlayedTogetherAt: '2026-09-19T18:00:00Z', lastFetchedAt: 0 }
        : id === 'tapped'
          ? { interactionCount: 40, gamesTogetherCount: 0, lastPlayedTogetherAt: null, lastFetchedAt: 0 }
          : undefined,
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

vi.mock('@/components/PlayerAvatar', () => ({
  PlayerAvatar: ({ player }: { player: { id: string } }) => <div data-testid={`avatar-${player.id}`} />,
}));

vi.mock('@/contexts/SportLevelContext', () => ({
  SportLevelProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { BasicUser } from '@/types';
import { PlayerListModal } from './PlayerListModal';

function player(id: string, firstName: string): BasicUser {
  return {
    id,
    firstName,
    lastName: 'Test',
    level: 3,
    socialLevel: 1,
    gender: 'MALE',
    approvedLevel: false,
    isTrainer: false,
    sportsEnabled: ['PADEL'],
  } as BasicUser;
}

function fetchResult(players: BasicUser[]) {
  return Object.assign([...players], { nearby: [], busyUserIds: [] });
}

const ROSTER = [player('tapped', 'Ana'), player('recent', 'Boris'), player('quiet', 'Ceca')];

function renderModal() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <PlayerListModal onClose={() => {}} />
    </QueryClientProvider>
  );
}

function setSearch(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

const headers = (container: HTMLElement) =>
  [...container.querySelectorAll('[data-testid="invite-group-header"]')].map((el) => el.textContent ?? '');

const settle = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe('PlayerListModal Played with (PRD 361)', () => {
  let root: Root | null = null;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    fetchPlayers.mockReset();
    fetchPlayers.mockImplementation(() => Promise.resolve(fetchResult(ROSTER)));
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container.remove();
  });

  it('shows the two group headings only with an empty query and a non-empty history', async () => {
    await act(async () => {
      root!.render(renderModal());
    });
    await settle();

    expect(headers(container)).toEqual([
      'playerInvite.groupPlayedWith1',
      'playerInvite.groupEveryone2',
    ]);
    const captions = container.querySelectorAll('[data-testid="played-together-caption"]');
    expect(captions).toHaveLength(1);
    expect(captions[0].textContent).toContain('playerInvite.playedTogetherCaption');

    // Played-with row comes first, before the tapped-but-never-played row.
    const names = [...container.querySelectorAll('[role="button"] p')]
      .map((p) => p.textContent ?? '')
      .filter((text) => /Boris|Ana|Ceca/.test(text));
    expect(names[0]).toContain('Boris');

    const search = container.querySelector('[data-testid="player-invite-search"]') as HTMLInputElement;
    await act(async () => {
      setSearch(search, 'b');
    });
    await settle();
    expect(headers(container)).toEqual([]);
    expect(container.querySelector('[data-testid="played-together-caption"]')).toBeNull();

    await act(async () => {
      setSearch(search, '');
    });
    await settle();
    expect(headers(container)).toHaveLength(2);
  });

  it('renders no headings at all when the viewer has no co-play history', async () => {
    fetchPlayers.mockImplementation(() =>
      Promise.resolve(fetchResult([player('tapped', 'Ana'), player('quiet', 'Ceca')])),
    );
    await act(async () => {
      root!.render(renderModal());
    });
    await settle();
    expect(headers(container)).toEqual([]);
    expect(container.querySelector('[data-testid="played-together-caption"]')).toBeNull();
  });

  it('keeps the selection across typing and restores the grouped state from cache on clear', async () => {
    await act(async () => {
      root!.render(renderModal());
    });
    await settle();
    expect(fetchPlayers).toHaveBeenCalledTimes(1);

    const row = [...container.querySelectorAll('[role="button"]')].find((el) =>
      (el.textContent ?? '').includes('Boris'),
    ) as HTMLElement;
    await act(async () => {
      row.click();
    });
    expect(row.className).toContain('bg-sky-500/15');

    const search = container.querySelector('[data-testid="player-invite-search"]') as HTMLInputElement;
    await act(async () => {
      setSearch(search, 'bo');
    });
    await settle();
    expect(fetchPlayers).toHaveBeenCalledTimes(2);
    expect(headers(container)).toEqual([]);

    await act(async () => {
      setSearch(search, '');
    });
    await settle();
    expect(fetchPlayers).toHaveBeenCalledTimes(2);
    expect(headers(container)).toHaveLength(2);
    const restored = [...container.querySelectorAll('[role="button"]')].find((el) =>
      (el.textContent ?? '').includes('Boris'),
    ) as HTMLElement;
    expect(restored.className).toContain('bg-sky-500/15');
  });
});
