// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const observed = vi.hoisted(() => {
  // Nothing has a layout in jsdom, so the test drives visibility by hand.
  const state = { intersecting: false, targets: [] as Element[] };
  class FakeIntersectionObserver {
    constructor(private readonly callback: IntersectionObserverCallback) {}
    observe(target: Element) {
      state.targets.push(target);
      this.callback(
        [
          {
            isIntersecting: state.intersecting,
            target,
          } as unknown as IntersectionObserverEntry,
        ],
        this as unknown as IntersectionObserver,
      );
    }
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  Object.defineProperty(window, 'IntersectionObserver', {
    configurable: true,
    writable: true,
    value: FakeIntersectionObserver,
  });
  return state;
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key}:${JSON.stringify(options)}` : key,
    i18n: { language: 'en' },
  }),
  // Something in the import graph reaches `@/i18n/config`, which calls
  // `i18n.use(initReactI18next)` at module load; the mock must carry it.
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

const navigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
  useLocation: () => ({ pathname: '/profile', search: '' }),
}));

vi.mock('@/hooks/usePrefersReducedMotion', () => ({ usePrefersReducedMotion: () => true }));
vi.mock('@/utils/capacitor', () => ({
  isAndroid: () => false,
  isIOS: () => false,
  isCapacitor: () => false,
}));
vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector: (state: { user: unknown }) => unknown) =>
    selector({ user: { id: 'me', currentCity: { id: 'city-1' } } }),
}));
vi.mock('@/utils/profileSports', () => ({
  getViewerPrimarySport: () => 'PADEL',
  hasMultipleSportsEnabled: () => false,
  listEnabledSports: () => ['PADEL'],
}));
vi.mock('@/components/leaderboard/LeaderboardSportPicker', () => ({
  LeaderboardSportPicker: () => null,
}));

const fetchNextPage = vi.fn(async () => ({ hasNextPage: false }));
let queryState: Record<string, unknown> = {};
vi.mock('@tanstack/react-query', () => ({
  useInfiniteQuery: () => queryState,
  // Rows pass the chemistry they already have, so the chip never fetches.
  useQuery: () => ({ data: undefined, isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn(), setQueryData: vi.fn() }),
  // Something in the import graph constructs a client at module load.
  QueryClient: class {
    invalidateQueries = vi.fn();
    setQueryData = vi.fn();
    getQueryData = vi.fn();
  },
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import type { PairEntry, PairLeaderboardPage, PairMember } from '@/api/pairs';
import { PairLeaderboard } from './PairLeaderboard';

function member(id: string): PairMember {
  return {
    id,
    firstName: id,
    lastName: null,
    avatar: null,
    isPremium: false,
    showPremiumStatus: false,
    level: 4,
  };
}

function entry(rank: number, a: string, b: string, isViewerPair = false): PairEntry {
  return {
    pairId: `${a},${b}`,
    rank,
    userA: member(a),
    userB: member(b),
    games: 12,
    wins: 8,
    winRate: 66.7,
    combinedLevel: 4,
    chemistry: 9,
    lastPlayedAt: null,
    isViewerPair,
    teamId: null,
  };
}

function page(pairs: PairEntry[], me: PairLeaderboardPage['me'] = null): PairLeaderboardPage {
  return { pairs, nextCursor: null, total: pairs.length, me };
}

function setQuery(pages: PairLeaderboardPage[], overrides: Record<string, unknown> = {}) {
  queryState = {
    data: { pages },
    isLoading: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage,
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  navigate.mockClear();
  fetchNextPage.mockClear();
  observed.intersecting = false;
  observed.targets = [];
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render() {
  act(() => {
    root.render(<PairLeaderboard />);
  });
}

const FIVE = [
  entry(1, 'a1', 'b1'),
  entry(2, 'a2', 'b2'),
  entry(3, 'a3', 'b3'),
  entry(4, 'a4', 'b4'),
  entry(5, 'me', 'zz', true),
];

describe('PairLeaderboard (PRD 352)', () => {
  it('shows the podium skeleton while loading', () => {
    setQuery([], { isLoading: true, data: undefined });
    render();
    expect(container.querySelector('[data-testid="pair-leaderboard-skeleton"]')).not.toBeNull();
  });

  it('puts the top three on the podium and the rest in rows', () => {
    setQuery([page(FIVE)]);
    render();
    expect(container.querySelectorAll('[data-testid="pair-podium-card"]')).toHaveLength(3);
    const rows = [...container.querySelectorAll<HTMLElement>('[data-testid="pair-row"]')];
    expect(rows.map((row) => row.dataset.pairId)).toEqual(['a4,b4', 'me,zz']);
  });

  it("marks the viewer's own pair with a soft sky inline-start border", () => {
    setQuery([page(FIVE)]);
    render();
    const mine = container.querySelector<HTMLElement>('[data-pair-id="me,zz"]')!;
    expect(mine.className).toContain('border-s-sky-300');
    // Logical property only — a physical `border-l` would flip wrong in `ar`.
    expect(mine.className).not.toContain('border-l-');
  });

  it('offers the scroll-to-my-pair pill when the viewer has a ranked pair off screen', () => {
    setQuery([page(FIVE, { rank: 5, pairId: 'me,zz' })]);
    render();
    const pill = container.querySelector<HTMLElement>('[data-testid="scroll-to-my-pair"]');
    expect(pill).not.toBeNull();
    expect(pill!.textContent).toContain('pairs.scrollToMyPair');
  });

  it('scrolls to the row and flashes it', async () => {
    setQuery([page(FIVE, { rank: 5, pairId: 'me,zz' })]);
    render();
    const scrollIntoView = vi.fn();
    const mine = container.querySelector<HTMLElement>('[data-pair-id="me,zz"]')!;
    mine.scrollIntoView = scrollIntoView;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0;
    });

    const pill = container.querySelector<HTMLButtonElement>('[data-testid="scroll-to-my-pair"]')!;
    await act(async () => {
      pill.click();
    });

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'center' });
    // Reduced motion is mocked on above, so the row must still say *which* pair
    // was found (the tint) but must not carry the infinite pulse (CONTRACT §7.1).
    const flashed = container.querySelector<HTMLElement>('[data-pair-id="me,zz"]')!.className;
    expect(flashed).toContain('bg-sky-100');
    expect(flashed).not.toContain('animate-pulse');
  });

  it('watches the podium card too, so a top-3 viewer pair hides the pill', () => {
    // Regression: the observer used to be scoped to the `<ul>`, which holds
    // ranks 4+. A #1 pair was never found, so the pill stuck on screen forever.
    observed.intersecting = true;
    const podiumFirst = [
      entry(1, 'me', 'zz', true),
      entry(2, 'a2', 'b2'),
      entry(3, 'a3', 'b3'),
      entry(4, 'a4', 'b4'),
    ];
    setQuery([page(podiumFirst, { rank: 1, pairId: 'me,zz' })]);
    render();

    expect(observed.targets.map((node) => (node as HTMLElement).dataset.pairId)).toEqual([
      'me,zz',
    ]);
    expect(container.querySelector('[data-testid="scroll-to-my-pair"]')).toBeNull();
  });

  it('hides the pill when the viewer has no ranked pair', () => {
    setQuery([page(FIVE.slice(0, 4))]);
    render();
    expect(container.querySelector('[data-testid="scroll-to-my-pair"]')).toBeNull();
  });

  it('routes a pair with a team straight to the team page and others to the overlay', () => {
    const withTeam = { ...entry(4, 'a4', 'b4'), teamId: 'team-7' };
    setQuery([page([...FIVE.slice(0, 3), withTeam, FIVE[4]!])]);
    render();

    const teamRow = container.querySelector<HTMLElement>('[data-pair-id="a4,b4"] button')!;
    act(() => teamRow.click());
    expect(navigate).toHaveBeenCalledWith('/user-team/team-7');

    const plainRow = container.querySelector<HTMLElement>('[data-pair-id="me,zz"] button')!;
    act(() => plainRow.click());
    expect(navigate).toHaveBeenCalledWith('/profile?pair=me%2Czz');
  });

  it('shows the empty state with the 5-game floor and a Find a game action', () => {
    setQuery([page([])]);
    render();
    expect(container.textContent).toContain('pairs.empty.title');
    expect(container.textContent).toContain('pairs.floorHint:{"count":5}');
    expect(container.textContent).toContain('pairs.empty.action');
  });
});
