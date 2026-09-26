// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveRailGame } from '@/api/live';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts && 'count' in opts ? `${key}:${String(opts.count)}` : key,
    i18n: { language: 'en' },
  }),
}));

/** Avatars pull presence stores and CDN helpers that this test does not need. */
vi.mock('@/components/PlayerAvatar', () => ({
  PlayerAvatar: ({ player }: { player: { id: string } }) => (
    <span data-testid="player-avatar">{player.id}</span>
  ),
}));
vi.mock('@/components/ClubAvatar', () => ({
  ClubAvatar: ({ club }: { club: { name?: string | null } }) => (
    <span data-testid="club-avatar">{club.name}</span>
  ),
}));

const reducedMotion = vi.hoisted(() => ({ value: false }));
vi.mock('@/hooks/usePrefersReducedMotion', () => ({
  usePrefersReducedMotion: () => reducedMotion.value,
}));

import { LiveNowRail } from './LiveNowRail';

const roots: Root[] = [];
const containers: HTMLDivElement[] = [];

beforeEach(() => {
  reducedMotion.value = false;
});

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  for (const container of containers.splice(0)) container.remove();
});

function render(node: ReactNode): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  containers.push(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(<MemoryRouter>{node}</MemoryRouter>));
  return container;
}

function player(id: string, firstName: string) {
  return {
    id,
    firstName,
    lastName: 'Test',
    avatar: null,
    level: 3,
    socialLevel: 0,
    gender: 'MALE',
    approvedLevel: false,
    isTrainer: false,
  };
}

function game(id: string, overrides: Partial<LiveRailGame> = {}): LiveRailGame {
  return {
    id,
    name: 'Evening padel',
    sport: 'PADEL',
    entityType: 'GAME',
    affectsRating: true,
    startTime: new Date(Date.now() - 23 * 60_000).toISOString(),
    cityId: 'city-1',
    cityName: 'Belgrade',
    clubId: 'club-1',
    clubName: 'Padel Centar',
    clubAvatar: null,
    courtName: 'court 3',
    viewerIsPlaying: false,
    followedSeason: false,
    liveSummary: {
      matchId: `match-${id}`,
      courtName: 'court 3',
      currentSet: 2,
      sides: [
        {
          teamNumber: 1,
          players: [player(`${id}-a`, 'Marko'), player(`${id}-b`, 'Ana')],
          setScores: [6, 3],
          currentGameScore: '40',
          leading: true,
        },
        {
          teamNumber: 2,
          players: [player(`${id}-c`, 'Luka'), player(`${id}-d`, 'Ivan')],
          setScores: [4, 2],
          currentGameScore: '15',
          leading: false,
        },
      ],
      startedAt: new Date(Date.now() - 23 * 60_000).toISOString(),
      revision: 4,
    },
    ...overrides,
  } as LiveRailGame;
}

describe('LiveNowRail', () => {
  it('renders nothing when there is nothing live', () => {
    const container = render(<LiveNowRail games={[]} onOpen={() => {}} />);
    expect(container.querySelector('[data-testid="live-now-rail"]')).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('renders the full-width Watch variant for a single live game', () => {
    const container = render(<LiveNowRail games={[game('g1')]} onOpen={() => {}} />);
    const rail = container.querySelector('[data-testid="live-now-rail"]');
    expect(rail?.getAttribute('data-layout')).toBe('single');
    expect(container.querySelector('[data-testid="live-now-rail-carousel"]')).toBeNull();
    expect(container.querySelector('[data-testid="live-watch-button"]')).not.toBeNull();
    expect(
      container.querySelector('[data-testid="live-score-card"]')?.getAttribute('data-variant'),
    ).toBe('full');
  });

  it('renders a snap carousel for two or more games', () => {
    const container = render(
      <LiveNowRail games={[game('g1'), game('g2'), game('g3')]} onOpen={() => {}} />,
    );
    const rail = container.querySelector('[data-testid="live-now-rail"]');
    expect(rail?.getAttribute('data-layout')).toBe('carousel');

    const carousel = container.querySelector('[data-testid="live-now-rail-carousel"]');
    expect(carousel).not.toBeNull();
    expect(carousel?.className).toContain('snap-x');
    // Keyboard scrollable, per the accessibility note.
    expect(carousel?.getAttribute('tabindex')).toBe('0');

    expect(container.querySelectorAll('[data-testid="live-score-card"]')).toHaveLength(3);
    expect(container.querySelector('[data-testid="live-watch-button"]')).toBeNull();
  });

  it('caps the card count', () => {
    const many = Array.from({ length: 6 }, (_, i) => game(`g${i}`));
    const container = render(<LiveNowRail games={many} onOpen={() => {}} maxCards={3} />);
    expect(container.querySelectorAll('[data-testid="live-score-card"]')).toHaveLength(3);
  });

  it('shows the See all link only when the caller supplies one', () => {
    const withoutLink = render(<LiveNowRail games={[game('g1'), game('g2')]} onOpen={() => {}} />);
    expect(withoutLink.querySelector('[data-testid="live-now-rail-see-all"]')).toBeNull();

    const seeAll = vi.fn();
    const withLink = render(
      <LiveNowRail
        games={[game('g1'), game('g2')]}
        onOpen={() => {}}
        variant="home"
        cityName="Belgrade"
        onSeeAll={seeAll}
      />,
    );
    const button = withLink.querySelector<HTMLButtonElement>(
      '[data-testid="live-now-rail-see-all"]',
    );
    expect(button).not.toBeNull();
    act(() => button!.click());
    expect(seeAll).toHaveBeenCalledTimes(1);
  });

  it('shows two shimmering skeletons while loading', () => {
    const container = render(<LiveNowRail games={[]} onOpen={() => {}} isLoading />);
    expect(container.querySelectorAll('[data-testid="live-score-card-skeleton"]')).toHaveLength(2);
    expect(
      container.querySelector('[data-testid="live-now-rail-loading"]')?.getAttribute('aria-busy'),
    ).toBe('true');
  });

  it('freezes the score and captions it when the socket is down', () => {
    const container = render(
      <LiveNowRail games={[game('g1'), game('g2')]} onOpen={() => {}} isReconnecting />,
    );
    // Scores stay on screen — the caption replaces only the "started" line.
    expect(container.textContent).toContain('live.reconnecting');
    expect(container.querySelectorAll('[data-testid="live-score-block"]')).toHaveLength(2);
    expect(container.textContent).toContain('6');
  });

  it('opens the tapped game', () => {
    const onOpen = vi.fn();
    const container = render(<LiveNowRail games={[game('g1'), game('g2')]} onOpen={onOpen} />);
    const card = container.querySelector<HTMLButtonElement>('[data-testid="live-score-card"]');
    act(() => card!.click());
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen.mock.calls[0][0].id).toBe('g1');
  });

  it('labels the score block for screen readers', () => {
    const container = render(<LiveNowRail games={[game('g1'), game('g2')]} onOpen={() => {}} />);
    const block = container.querySelector('[data-testid="live-score-block"]');
    expect(block?.getAttribute('role')).toBe('img');
    expect(block?.getAttribute('aria-label')).toContain('live.scoreLead');
  });

  it('drops every layout animation under reduced motion', () => {
    reducedMotion.value = true;
    const container = render(<LiveNowRail games={[game('g1'), game('g2')]} onOpen={() => {}} />);
    // Under reduced motion the leading-side glow is off, so the score block
    // must not carry any animation-driven transform.
    const block = container.querySelector('[data-testid="live-score-block"]');
    expect(block).not.toBeNull();
    expect(block?.getAttribute('style') ?? '').not.toContain('transform');
    // The score is still fully readable.
    expect(container.textContent).toContain('40');
  });

  it('uses only logical spacing so the carousel mirrors in RTL', () => {
    const container = render(<LiveNowRail games={[game('g1'), game('g2')]} onOpen={() => {}} />);
    const html = container.innerHTML;
    expect(html).not.toMatch(/class="[^"]*\b(ml|mr|pl|pr)-\d/);
    expect(html).not.toMatch(/class="[^"]*\btext-(left|right)\b/);
  });
});
