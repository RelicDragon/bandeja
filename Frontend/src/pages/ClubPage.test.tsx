// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicClub } from '@/api/clubPublic';

/**
 * PRD 354 — the public club page.
 *
 * Covers the behaviour the PRD calls out: guest vs authenticated actions, the
 * admin-only Manage button, court-chip prefill navigation, the sticky header,
 * and the empty upcoming-games state.
 */
const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  addToFavorites: vi.fn().mockResolvedValue({ success: true }),
  removeFromFavorites: vi.fn().mockResolvedValue({ success: true }),
  rememberPostLoginPath: vi.fn(),
  openExternalUrl: vi.fn(),
  authState: {
    user: null as { id: string; isPremium?: boolean } | null,
    isAuthenticated: false,
  },
  clubQuery: { data: undefined as PublicClub | undefined, isLoading: false },
  gamesQuery: { data: { games: [] as unknown[], hasMore: false }, isLoading: false },
  regularsQuery: { data: [] as unknown[] },
  todayQuery: { data: undefined as unknown },
  scroll: { progress: 0, parallaxOffset: 0 },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
  useParams: () => ({ id: 'club-1' }),
  Link: ({ children }: { children: React.ReactNode }) => <a href="#test">{children}</a>,
}));

vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));

vi.mock('framer-motion', async () => {
  const React = await import('react');
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: new Proxy(
      {},
      {
        get: (_target, tag: string) =>
          React.forwardRef<HTMLElement, Record<string, unknown>>((props, ref) => {
            const {
              initial: _initial,
              animate: _animate,
              exit: _exit,
              transition: _transition,
              whileInView: _whileInView,
              viewport: _viewport,
              layout: _layout,
              ...rest
            } = props;
            return React.createElement(tag, { ...rest, ref });
          }),
      },
    ),
  };
});

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock('@/queries/clubPage/useClubPageQueries', () => ({
  useClubPageQuery: () => mocks.clubQuery,
  useClubPageGamesQuery: () => mocks.gamesQuery,
  useClubPageRegularsQuery: () => mocks.regularsQuery,
  useClubTodayAvailabilityQuery: () => mocks.todayQuery,
}));

vi.mock('@/components/clubPage/useClubPageScroll', () => ({
  useClubPageScroll: () => mocks.scroll,
}));

vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector: (s: typeof mocks.authState) => unknown) => selector(mocks.authState),
}));

vi.mock('@/hooks/usePrefersReducedMotion', () => ({ usePrefersReducedMotion: () => true }));

vi.mock('@/api/favorites', () => ({
  favoritesApi: {
    addToFavorites: mocks.addToFavorites,
    removeFromFavorites: mocks.removeFromFavorites,
  },
}));

vi.mock('@/utils/postLoginRedirect', () => ({
  rememberPostLoginPath: mocks.rememberPostLoginPath,
}));

vi.mock('@/utils/openExternalUrl', () => ({ openExternalUrl: mocks.openExternalUrl }));

vi.mock('@/utils/shareUrl', () => ({
  getClubShareUrl: (id: string) => `https://bandeja.me/clubs/${id}`,
}));

// Heavy children that own their own data and are covered by their own tests.
vi.mock('@/components/ClubReviewsSection', () => ({
  ClubReviewsSection: () => <div data-testid="reviews" />,
}));
vi.mock('@/components/clubPage/ClubPageInfoSection', () => ({
  ClubPageInfoSection: () => <div data-testid="info" />,
}));
vi.mock('@/components/clubPage/ClubHeroGallery', () => ({
  ClubHeroGallery: () => <div data-testid="gallery" />,
}));
vi.mock('@/components/clubPage/ClubRegularsRow', () => ({
  ClubRegularsRow: () => <div data-testid="regulars" />,
}));
vi.mock('@/components/home/GamesByDateList', () => ({
  GamesByDateList: ({ games }: { games: unknown[] }) => (
    <div data-testid="games-list">{games.length}</div>
  ),
}));
vi.mock('@/components/ClubAvatar', () => ({
  ClubAvatar: ({ club: c }: { club: { name: string } }) => <span>{c.name}</span>,
}));
vi.mock('@/components/sport/SportPublicIcon', () => ({
  SportPublicIcon: ({ sport }: { sport: string }) => <span data-sport={sport} />,
}));
// `EmptyStateCard` reaches the `@/components` barrel; stub it so this test does
// not boot half the kit just to read a title.
vi.mock('@/components/home/EmptyStateCard', () => ({
  EmptyStateCard: ({
    title,
    description,
    action,
  }: {
    title: string;
    description?: string;
    action?: React.ReactNode;
  }) => (
    <div data-testid="empty-state">
      <p>{title}</p>
      <p>{description}</p>
      {action}
    </div>
  ),
}));
vi.mock('@/components/ShareModal', () => ({
  ShareModal: ({ isOpen, shareUrl }: { isOpen: boolean; shareUrl: string }) =>
    isOpen ? <div data-testid="share-modal">{shareUrl}</div> : null,
}));

const club: PublicClub = {
  id: 'club-1',
  name: 'Padel Central',
  description: null,
  avatar: null,
  photos: [],
  carouselPhotos: [],
  address: 'Main street 1',
  cityId: 'city-1',
  phone: null,
  email: null,
  website: null,
  latitude: 44.8,
  longitude: 20.4,
  openingTime: '08:00',
  closingTime: '23:00',
  amenities: null,
  isBar: false,
  isForPlaying: true,
  sports: ['PADEL'],
  clubRating: 4.6,
  clubReviewCount: 38,
  courtsNumber: 2,
  defaultSlotMinutes: 90,
  cancellationNoticeHours: 24,
  policyText: null,
  city: { id: 'city-1', name: 'Belgrade', country: 'RS', timezone: 'Europe/Belgrade' },
  courts: [],
  booking: { available: false, provider: null },
  isFavorite: false,
  isAdmin: false,
};

function click(container: HTMLElement, selector: string) {
  const el = container.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`missing element: ${selector}`);
  el.click();
}

describe('ClubPage', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authState = { user: null, isAuthenticated: false };
    mocks.clubQuery = { data: { ...club }, isLoading: false };
    mocks.gamesQuery = { data: { games: [], hasMore: false }, isLoading: false };
    mocks.regularsQuery = { data: [] };
    mocks.todayQuery = { data: undefined };
    mocks.scroll = { progress: 0, parallaxOffset: 0 };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function render() {
    const { ClubPage } = await import('./ClubPage');
    await act(async () => {
      root.render(<ClubPage />);
    });
  }

  it('renders the club for a guest', async () => {
    await render();
    expect(container.textContent).toContain('Padel Central');
    expect(container.querySelector('[data-testid="info"]')).not.toBeNull();
    // PRD 354 "Guest behavior": everything renders; only *writing* a review
    // prompts login. The reviews list itself must be readable signed out.
    expect(container.querySelector('[data-testid="reviews"]')).not.toBeNull();
    expect(container.textContent).toContain('clubPage.reviews.guestTitle');
  });

  it('drops the write-a-review login prompt once signed in', async () => {
    mocks.authState = { user: { id: 'u1' }, isAuthenticated: true };
    await render();
    expect(container.querySelector('[data-testid="reviews"]')).not.toBeNull();
    expect(container.textContent).not.toContain('clubPage.reviews.guestTitle');
  });

  it('sends a guest to sign in with the return path remembered', async () => {
    await render();
    click(container, '[aria-label="favorites.addToFavorites"]');
    expect(mocks.rememberPostLoginPath).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).toHaveBeenCalledWith('/login');
    expect(mocks.addToFavorites).not.toHaveBeenCalled();
  });

  it('favourites the club for an authenticated viewer', async () => {
    mocks.authState = { user: { id: 'u1' }, isAuthenticated: true };
    await render();
    await act(async () => {
      click(container, '[aria-label="favorites.addToFavorites"]');
    });
    expect(mocks.addToFavorites).toHaveBeenCalledWith('club-1');
    expect(mocks.rememberPostLoginPath).not.toHaveBeenCalled();
  });

  it('hides Manage unless the viewer administers the club', async () => {
    mocks.authState = { user: { id: 'u1' }, isAuthenticated: true };
    await render();
    expect(container.querySelector('[data-testid="club-page-manage"]')).toBeNull();

    await act(async () => root.unmount());
    root = createRoot(container);
    mocks.clubQuery = { data: { ...club, isAdmin: true }, isLoading: false };
    await render();
    const manage = container.querySelector<HTMLElement>('[data-testid="club-page-manage"]');
    expect(manage).not.toBeNull();
    manage?.click();
    expect(mocks.navigate).toHaveBeenCalledWith('/my-clubs');
  });

  it('shows Book only when the club has a booking integration', async () => {
    await render();
    expect(container.querySelector('[data-testid="club-page-book"]')).toBeNull();

    await act(async () => root.unmount());
    root = createRoot(container);
    mocks.clubQuery = {
      data: { ...club, booking: { available: true, provider: 'BOOKTIME' } },
      isLoading: false,
    };
    await render();
    expect(container.querySelector('[data-testid="club-page-book"]')).not.toBeNull();
  });

  it('prefills club, court and date when a today chip is tapped', async () => {
    mocks.authState = { user: { id: 'u1' }, isAuthenticated: true };
    mocks.clubQuery = {
      data: { ...club, booking: { available: true, provider: 'BOOKTIME' } },
      isLoading: false,
    };
    mocks.todayQuery = {
      data: {
        date: '2026-09-20',
        timezone: 'Europe/Belgrade',
        openHour: 8,
        closeHour: 10,
        updatedAt: null,
        courts: [
          {
            courtId: 'court-3',
            name: 'Court 3',
            isIndoor: true,
            freeHours: 1,
            hours: [
              { hour: 8, busy: false },
              { hour: 9, busy: true },
            ],
          },
        ],
      },
    };
    await render();

    const chip = container.querySelector<HTMLElement>('[aria-label^="clubPage.today.courtLabel"]');
    expect(chip).not.toBeNull();
    await act(async () => chip?.click());

    expect(mocks.navigate).toHaveBeenCalledWith(
      '/create-game?clubId=club-1&entityType=GAME&courtId=court-3&date=2026-09-20',
    );
  });

  it('shows the empty games state with the create action', async () => {
    await render();
    expect(container.querySelector('[data-testid="games-list"]')).toBeNull();
    expect(container.textContent).toContain('clubPage.games.emptyTitle');
    // "See all on Find" is pointless with nothing to see.
    expect(container.textContent).not.toContain('clubPage.games.seeAll');
  });

  it('lists games grouped by day and links through to Find', async () => {
    mocks.gamesQuery = {
      data: { games: [{ id: 'g1' }, { id: 'g2' }], hasMore: true },
      isLoading: false,
    };
    await render();
    expect(container.querySelector('[data-testid="games-list"]')?.textContent).toBe('2');
    expect(container.textContent).toContain('clubPage.games.seeAll');
  });

  it('caps the upcoming list at ten games', async () => {
    mocks.gamesQuery = {
      data: {
        games: Array.from({ length: 14 }, (_, i) => ({ id: `g${i}` })),
        hasMore: true,
      },
      isLoading: false,
    };
    await render();
    expect(container.querySelector('[data-testid="games-list"]')?.textContent).toBe('10');
  });

  it('hides the sticky header at the top and shows it once the hero collapses', async () => {
    await render();
    const header = container.querySelector<HTMLElement>('[data-testid="club-page-sticky-header"]');
    expect(header?.getAttribute('aria-hidden')).toBe('true');
    expect(header?.style.opacity).toBe('0');

    await act(async () => root.unmount());
    root = createRoot(container);
    mocks.scroll = { progress: 1, parallaxOffset: 0 };
    await render();
    const collapsed = container.querySelector<HTMLElement>(
      '[data-testid="club-page-sticky-header"]',
    );
    expect(collapsed?.getAttribute('aria-hidden')).toBe('false');
    expect(collapsed?.style.opacity).toBe('1');
    expect(collapsed?.textContent).toContain('Padel Central');
  });

  it('opens the share modal with the public club URL', async () => {
    await render();
    await act(async () => click(container, '[aria-label="clubPage.share"]'));
    expect(container.querySelector('[data-testid="share-modal"]')?.textContent).toBe(
      'https://bandeja.me/clubs/club-1',
    );
  });

  it('falls back to the not-found empty state', async () => {
    mocks.clubQuery = { data: undefined, isLoading: false };
    await render();
    expect(container.textContent).toContain('clubPage.notFound.title');
    expect(container.textContent).toContain('clubPage.notFound.browse');
  });
});
