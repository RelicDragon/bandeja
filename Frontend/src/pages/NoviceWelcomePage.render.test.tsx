// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Game } from '@/types';
import { NoviceWelcomePage } from './NoviceWelcomePage';

const state = vi.hoisted(() => ({
  games: [] as Partial<Game>[],
  invites: [] as { id: string }[],
  unlockAll: vi.fn(async () => ({})),
}));

vi.mock('@/store/authStore', async () => {
  const { create } = await import('zustand');
  return {
    useAuthStore: create(() => ({
      user: {
        id: 'u1',
        firstName: 'Ana',
        cityIsSet: true,
        currentCity: { id: 'c1' },
        sportsEnabled: ['PADEL'],
        noviceRank: 0,
        noviceCountedGames: 0,
        noviceMilestoneSeenRank: 0,
        noviceUnlockedAllAt: null,
      },
    })),
  };
});
vi.mock('@/hooks/useNovice', () => ({
  useNovice: () => ({ rank: 0, countedGames: 0, progress: { current: 0, target: 5 }, isActive: true }),
  unlockAllNovice: state.unlockAll,
}));
vi.mock('@/hooks/useMyGames', () => ({
  useMyGames: () => ({ games: state.games, invites: state.invites, unreadCounts: {}, refetch: vi.fn() }),
}));
vi.mock('@/components/home/useHomeInviteActions', () => ({
  useHomeInviteActions: () => ({
    handleAcceptInvite: vi.fn(),
    handleDeclineInvite: vi.fn(),
    declineInviteModal: null,
    decliningInviteIds: new Set(),
  }),
}));
vi.mock('@/components/home', () => ({
  InvitesSection: ({ invites }: { invites: unknown[] }) => <div data-testid="invites">{invites.length}</div>,
}));
vi.mock('@/components/home/CityPromptBanner', () => ({ CityPromptBanner: () => null }));
vi.mock('@/components/home/PlayHeroButton', () => ({ PlayHeroButton: () => <div data-testid="play-hero" /> }));
vi.mock('@/components/home/TrainersList', () => ({ TrainersList: () => <div data-testid="trainers" /> }));
vi.mock('@/components/playIntent/PlayIntentFindBar', () => ({
  PlayIntentProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/playIntent/PlayIntentContext', () => ({
  usePlayIntentContext: () => ({ enabled: true, looking: false, openCompose: vi.fn() }),
}));
vi.mock('@/components/novice/welcome/useWelcomeWeekGames', () => ({
  useWelcomeWeekGames: () => ({ data: [], isPending: false, fetchStatus: 'idle', refetch: vi.fn() }),
}));
vi.mock('@/components', () => ({
  GameCard: ({ game }: { game: Game }) => <div data-testid="game-card">{game.id}</div>,
  CityModal: () => null,
  ConfirmationModal: ({ isOpen, onConfirm }: { isOpen: boolean; onConfirm: () => void }) =>
    isOpen ? <button type="button" data-testid="confirm" onClick={onConfirm} /> : null,
}));
vi.mock('@/components/home/GameCardSkeleton', () => ({ GamesLoadingSkeleton: () => null }));
vi.mock('@/utils/openExternalUrl', () => ({ openExternalUrl: vi.fn() }));
vi.mock('@/hooks/usePrefersReducedMotion', () => ({ usePrefersReducedMotion: () => true }));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  class NoopObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
  }
  Object.assign(globalThis, { IntersectionObserver: NoopObserver });
  state.games = [];
  state.invites = [];
  state.unlockAll.mockClear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const render = () =>
  act(() => root.render(<MemoryRouter><NoviceWelcomePage /></MemoryRouter>));
const byTestId = (id: string) => host.querySelector(`[data-testid="${id}"]`);

it('greets a newcomer with progress, both choices and the teaser — no game hero, no ads', () => {
  render();
  expect(byTestId('novice-welcome-page')).not.toBeNull();
  expect(host.textContent).toContain('novice.welcome.greeting');
  expect(byTestId('novice-progress-ring')?.textContent).toBe('0/5');
  expect(byTestId('novice-rank-ladder')?.querySelectorAll('li')).toHaveLength(6);
  expect(byTestId('novice-welcome-game-hero')).toBeNull();
  expect(byTestId('novice-welcome-play')?.getAttribute('aria-pressed')).toBe('true');
  expect(byTestId('play-hero')).not.toBeNull();
  expect(byTestId('novice-welcome-novice-games')?.textContent).toContain('novice.welcome.noviceGamesEmpty');
  expect(byTestId('novice-teaser')).not.toBeNull();
  expect(byTestId('novice-welcome-profile')).not.toBeNull();
  expect(byTestId('invites')).toBeNull();
  expect(host.querySelector('[role="navigation"]')).toBeNull();
});

it('switches to trainings and coaches on "I want to learn"', () => {
  render();
  act(() => (byTestId('novice-welcome-learn') as HTMLButtonElement).click());
  expect(byTestId('novice-welcome-learn')?.getAttribute('aria-pressed')).toBe('true');
  expect(byTestId('novice-welcome-trainings')).not.toBeNull();
  expect(byTestId('trainers')).not.toBeNull();
  expect(byTestId('play-hero')).toBeNull();
});

it('leads with the upcoming game and shows pending invites', () => {
  const start = new Date(Date.now() + 86_400_000).toISOString();
  state.games = [
    { id: 'past', status: 'FINISHED', startTime: start, endTime: start, entityType: 'GAME' },
    { id: 'next', status: 'ANNOUNCED', startTime: start, endTime: start, entityType: 'GAME' },
  ];
  state.invites = [{ id: 'inv1' }];
  render();
  const hero = byTestId('novice-welcome-game-hero');
  expect(hero?.textContent).toContain('novice.welcome.firstGameTitle');
  expect(hero?.querySelector('[data-testid="game-card"]')?.textContent).toBe('next');
  expect(byTestId('invites')?.textContent).toBe('1');
});

it('unlocks everything only after confirmation', async () => {
  render();
  act(() => (byTestId('novice-unlock-all') as HTMLButtonElement).click());
  expect(state.unlockAll).not.toHaveBeenCalled();
  await act(async () => (byTestId('confirm') as HTMLButtonElement).click());
  expect(state.unlockAll).toHaveBeenCalledTimes(1);
});
