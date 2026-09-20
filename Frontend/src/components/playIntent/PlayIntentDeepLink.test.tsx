// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * PRD 350 / PRD 353 regression: the onboarding finale and the recap outro both
 * land on `/?playIntentOpen=1`. The provider must open the sheet and strip the
 * param — before the fix the param had no consumer at all and the user landed
 * on plain Home with a stray query string.
 */

const mocks = vi.hoisted(() => ({
  pool: {
    data: undefined as unknown,
    isLoading: false,
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('react-hot-toast', () => ({ default: { error: vi.fn() } }));

vi.mock('@/hooks/useNavigateWithTracking', () => ({
  useNavigateWithTracking: () => vi.fn(),
}));

vi.mock('@/components/motion/AnimatedMount', () => ({
  AnimatedMount: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector: (state: { user: { id: string } }) => unknown) =>
    selector({ user: { id: 'user-1' } }),
}));

vi.mock('@/hooks/usePlayIntent', () => ({
  usePlayIntentPool: () => ({
    data: mocks.pool.data,
    isLoading: mocks.pool.isLoading,
    refetch: vi.fn(),
  }),
  usePlayIntentMutations: () => ({
    cancel: { mutateAsync: vi.fn().mockResolvedValue({ cancelled: 0 }) },
  }),
}));

vi.mock('@/api/playIntents', () => ({
  playIntentsApi: { getProposal: vi.fn() },
}));

vi.mock('./useSharedPlayIntentEntry', () => ({
  useSharedPlayIntentEntry: () => ({
    intent: null,
    joining: false,
    progress: null,
    joinedSport: null,
    clearJoinedSport: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

vi.mock('./PlayIntentSheet', () => ({
  PlayIntentSheet: ({ open, initialMode }: { open: boolean; initialMode: string }) => (
    <div data-testid="sheet" data-open={String(open)} data-mode={initialMode} />
  ),
}));

vi.mock('./PlayIntentLookingStrip', () => ({
  PlayIntentLookingStrip: () => <div />,
}));

vi.mock('./PlayIntentIdleCtaCard', () => ({
  PlayIntentIdleCtaCard: () => <div />,
}));

vi.mock('./SharedPlayIntentDialog', () => ({
  SharedPlayIntentDialog: () => <div />,
}));

vi.mock('./SharedPlayIntentProgressDialog', () => ({
  SharedPlayIntentProgressDialog: () => <div />,
}));

function SearchProbe() {
  const location = useLocation();
  return <output data-testid="search">{location.search}</output>;
}

const emptyPool = {
  members: [],
  overflow: 0,
  partySize: 4,
  availableCount: 0,
  clusterProgress: 1,
  total: 0,
  todayKey: '2026-07-29',
  discoveryDateKeys: [],
  matchingGames: [],
  myIntent: null,
  pendingProposal: null,
};

describe('PlayIntentProvider — ?playIntentOpen=1', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pool.data = emptyPool;
    mocks.pool.isLoading = false;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  const renderAt = async (entry: string) => {
    const { PlayIntentProvider } = await import('./PlayIntentFindBar');
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[entry]}>
          <PlayIntentProvider cityId="city-1" sport="PADEL" acceptSharedDeepLinks>
            <SearchProbe />
          </PlayIntentProvider>
        </MemoryRouter>,
      );
    });
  };

  const sheet = () => container.querySelector('[data-testid="sheet"]');

  it('opens the compose sheet and cleans the param out of the URL', async () => {
    await renderAt('/?playIntentOpen=1');

    expect(sheet()?.getAttribute('data-open')).toBe('true');
    expect(sheet()?.getAttribute('data-mode')).toBe('compose');
    expect(container.querySelector('[data-testid="search"]')?.textContent).toBe('');
  });

  it('opens the lobby instead when the viewer is already looking', async () => {
    mocks.pool.data = { ...emptyPool, myIntent: { id: 'intent-1', dateKeys: [], timeOfDay: 'ANYTIME' } };
    await renderAt('/?playIntentOpen=1');

    expect(sheet()?.getAttribute('data-open')).toBe('true');
    expect(sheet()?.getAttribute('data-mode')).toBe('lobby');
    expect(container.querySelector('[data-testid="search"]')?.textContent).toBe('');
  });

  it('waits for the pool before deciding the mode', async () => {
    mocks.pool.data = undefined;
    mocks.pool.isLoading = true;
    await renderAt('/?playIntentOpen=1');

    expect(sheet()?.getAttribute('data-open')).toBe('false');
    expect(container.querySelector('[data-testid="search"]')?.textContent).toBe(
      '?playIntentOpen=1',
    );
  });

  it('leaves unrelated params alone and stays closed without the param', async () => {
    await renderAt('/?tab=games');

    expect(sheet()?.getAttribute('data-open')).toBe('false');
    expect(container.querySelector('[data-testid="search"]')?.textContent).toBe('?tab=games');
  });

  it('preserves other params while stripping only playIntentOpen', async () => {
    await renderAt('/?tab=games&playIntentOpen=1');

    expect(sheet()?.getAttribute('data-open')).toBe('true');
    expect(container.querySelector('[data-testid="search"]')?.textContent).toBe('?tab=games');
  });
});
