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
import { finishedRailGamePath } from '@/features/live/finishedRailGamePath';

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
    followingPlaying: false,
    phase: 'live',
    finishedAt: null,
    matchPosition: null,
    isPublic: true,
    league: null,
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

  it('renders one full-width card for a single live game', () => {
    const container = render(<LiveNowRail games={[game('g1')]} onOpen={() => {}} />);
    const rail = container.querySelector('[data-testid="live-now-rail"]');
    expect(rail?.getAttribute('data-layout')).toBe('single');
    expect(container.querySelector('[data-testid="live-now-rail-carousel"]')).toBeNull();
    const card = container.querySelector('[data-testid="live-score-card"]');
    expect(card?.getAttribute('data-variant')).toBe('full');
    expect(card?.querySelector('[data-testid="live-watch-cta"]')).not.toBeNull();
  });

  it('draws a scoreboard: one row per side, a column per set, then the points', () => {
    // Reduced motion renders each digit once (no slide copy), so textContent is exact.
    reducedMotion.value = true;
    const container = render(<LiveNowRail games={[game('g1')]} onOpen={() => {}} />);
    const rows = container.querySelectorAll('[data-testid="live-score-row"]');
    expect(rows).toHaveLength(2);
    // The running set's games (3 and 2) sit next to the completed set, not hidden
    // behind the point score.
    expect(rows[0].textContent).toBe('g1-ag1-bMarko / Ana6340');
    expect(rows[1].textContent).toBe('g1-cg1-dLuka / Ivan4215');
  });

  it('omits the points column for sports without a sub-game score', () => {
    reducedMotion.value = true;
    const points = game('g1');
    points.liveSummary.sides[0].currentGameScore = '';
    points.liveSummary.sides[1].currentGameScore = '';
    const container = render(<LiveNowRail games={[points]} onOpen={() => {}} />);
    const rows = container.querySelectorAll('[data-testid="live-score-row"]');
    expect(rows[0].textContent).toBe('g1-ag1-bMarko / Ana63');
  });

  it('never nests an interactive element inside a card', () => {
    const container = render(<LiveNowRail games={[game('g1'), game('g2')]} onOpen={() => {}} />);
    for (const card of container.querySelectorAll('[data-testid="live-score-card"]')) {
      expect(card.tagName).toBe('BUTTON');
      expect(card.querySelector('button, a, [role="button"]')).toBeNull();
    }
  });

  it('switches the started line to hours after the first hour', () => {
    const long = game('g1');
    long.liveSummary.startedAt = new Date(Date.now() - 663 * 60_000).toISOString();
    const container = render(<LiveNowRail games={[long]} onOpen={() => {}} />);
    expect(container.textContent).toContain('live.startedHours:11');
    expect(container.textContent).not.toContain('live.started:663');
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

    const cards = container.querySelectorAll('[data-testid="live-score-card"]');
    expect(cards).toHaveLength(3);
    for (const card of cards) expect(card.getAttribute('data-variant')).toBe('carousel');
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

  function finished(id: string, overrides: Partial<LiveRailGame> = {}): LiveRailGame {
    const base = game(id);
    return {
      ...base,
      phase: 'finished',
      finishedAt: new Date(Date.now() - 40 * 60_000).toISOString(),
      liveSummary: {
        ...base.liveSummary,
        revision: undefined,
        sides: [
          { ...base.liveSummary.sides[0], setScores: [6, 4], currentGameScore: '', leading: false },
          { ...base.liveSummary.sides[1], setScores: [3, 6], currentGameScore: '', leading: false },
        ],
      },
      ...overrides,
    };
  }

  it('draws a finished game as a final scoreboard that opens results', () => {
    reducedMotion.value = true;
    const done = finished('f1');
    done.liveSummary.sides[1].leading = true;
    const container = render(<LiveNowRail games={[done]} onOpen={() => {}} />);
    const card = container.querySelector('[data-testid="live-score-card"]');
    expect(card?.getAttribute('data-phase')).toBe('finished');
    // Every set is final; no point chip, a tick on the winner only.
    const rows = container.querySelectorAll('[data-testid="live-score-row"]');
    expect(rows[0].textContent).toBe('f1-af1-bMarko / Ana64');
    expect(rows[1].querySelector('[data-testid="live-winner-mark"]')).not.toBeNull();
    expect(rows[0].querySelector('[data-testid="live-winner-mark"]')).toBeNull();
    expect(card?.querySelector('[data-testid="live-results-cta"]')).not.toBeNull();
    expect(card?.querySelector('[data-testid="live-watch-cta"]')).toBeNull();
    expect(container.textContent).toContain('live.final');
    expect(container.textContent).toContain('live.finished:40');
  });

  it('titles the rail "Live" while anything is live, "Today" once only results remain', () => {
    const mixed = render(
      <LiveNowRail games={[game('g1'), finished('f1')]} onOpen={() => {}} variant="home" cityName="Novi Sad" />,
    );
    expect(mixed.querySelector('[data-testid="live-now-rail"]')?.getAttribute('data-live')).toBe('true');
    expect(mixed.textContent).toContain('live.cityTitle');

    const resultsOnly = render(
      <LiveNowRail games={[finished('f1'), finished('f2')]} onOpen={() => {}} variant="home" cityName="Novi Sad" />,
    );
    expect(resultsOnly.querySelector('[data-testid="live-now-rail"]')?.getAttribute('data-live')).toBe('false');
    expect(resultsOnly.textContent).toContain('live.cityTodayTitle');
    // Results are not "live": no live count, no reconnecting caption.
    expect(resultsOnly.textContent).not.toContain('live.reconnecting');
  });

  it('never freezes a finished card when the socket drops', () => {
    const container = render(
      <LiveNowRail games={[game('g1'), finished('f1')]} onOpen={() => {}} isReconnecting />,
    );
    const cards = container.querySelectorAll('[data-testid="live-score-card"]');
    expect(cards[0].textContent).toContain('live.reconnecting');
    expect(cards[1].textContent).not.toContain('live.reconnecting');
  });

  it('accents league fixtures with a ribbon naming the league and round', () => {
    const league = game('l1', {
      league: { seasonGameId: 'season-1', name: 'Novi Sad Winter League', roundNumber: 3, isPlayoff: false },
    });
    const container = render(<LiveNowRail games={[league, game('g2')]} onOpen={() => {}} />);
    const cards = container.querySelectorAll('[data-testid="live-score-card"]');
    expect(cards[0].getAttribute('data-league')).toBe('true');
    const ribbon = cards[0].querySelector('[data-testid="live-league-ribbon"]');
    expect(ribbon?.textContent).toContain('Novi Sad Winter League');
    expect(ribbon?.textContent).toContain('live.leagueRound');
    expect(cards[0].getAttribute('aria-label')).toContain('Novi Sad Winter League');
    expect(cards[1].querySelector('[data-testid="live-league-ribbon"]')).toBeNull();
  });

  it('says which match of a multi-match game the card shows', () => {
    const done = finished('f1', { matchPosition: { kind: 'match', index: 3, count: 3 } });
    const container = render(<LiveNowRail games={[done]} onOpen={() => {}} />);
    const card = container.querySelector('[data-testid="live-score-card"]');
    expect(card?.textContent).toContain('live.matchOf');
    expect(card?.getAttribute('aria-label')).toContain('live.matchOf');
  });

  it('draws a hand-scored game in progress: entered sets, no board, opens the game', () => {
    reducedMotion.value = true;
    const base = game('p1');
    const typed = game('p1', {
      phase: 'inProgress',
      entityType: 'TOURNAMENT',
      name: 'Autumn Americano',
      followingPlaying: true,
      matchPosition: { kind: 'round', round: 4 },
      liveSummary: {
        ...base.liveSummary,
        revision: undefined,
        sides: [
          { ...base.liveSummary.sides[0], setScores: [6, 2], currentGameScore: '', leading: true },
          { ...base.liveSummary.sides[1], setScores: [3, 1], currentGameScore: '', leading: false },
        ],
      },
    });
    const onOpen = vi.fn();
    const container = render(<LiveNowRail games={[typed]} onOpen={onOpen} isReconnecting />);
    const card = container.querySelector('[data-testid="live-score-card"]') as HTMLButtonElement;
    expect(card.getAttribute('data-phase')).toBe('inProgress');
    expect(card.querySelector('[data-testid="live-in-progress-chip"]')).not.toBeNull();
    expect(card.querySelector('[data-testid="live-results-cta"]')).not.toBeNull();
    expect(card.querySelector('[data-testid="live-watch-cta"]')).toBeNull();
    expect(card.querySelector('[data-testid="live-winner-mark"]')).toBeNull();
    // Entered sets, no point chip, never "Reconnecting" — there is no board.
    const rows = container.querySelectorAll('[data-testid="live-score-row"]');
    expect(rows[0].textContent).toBe('p1-ap1-bMarko / Ana62');
    expect(card.textContent).not.toContain('live.reconnecting');
    // The tournament's name and round ride in a ribbon, not the footer.
    const ribbon = card.querySelector('[data-testid="live-tournament-ribbon"]');
    expect(ribbon?.textContent).toContain('Autumn Americano');
    expect(ribbon?.textContent).toContain('live.tournamentRound');
    act(() => card.click());
    expect(onOpen).toHaveBeenCalledWith(typed);
  });

  it('shows who is on court before anything is entered', () => {
    reducedMotion.value = true;
    const base = game('p2');
    const blank = game('p2', {
      phase: 'inProgress',
      liveSummary: {
        ...base.liveSummary,
        sides: [
          { ...base.liveSummary.sides[0], setScores: [], currentGameScore: '', leading: false },
          { ...base.liveSummary.sides[1], setScores: [], currentGameScore: '', leading: false },
        ],
      },
    });
    const container = render(<LiveNowRail games={[blank]} onOpen={() => {}} />);
    const rows = container.querySelectorAll('[data-testid="live-score-row"]');
    expect(rows[0].textContent).toBe('p2-ap2-bMarko / Ana');
    expect(
      container.querySelector('[data-testid="live-score-block"]')?.getAttribute('aria-label'),
    ).toBe('live.scorePending');
  });

  it('sends a stranger tapping a private league result to the season, not a 404', () => {
    const league = { seasonGameId: 'season-1', name: 'L', roundNumber: 1, isPlayoff: false };
    expect(finishedRailGamePath({ id: 'g', isPublic: true, viewerIsPlaying: false, league: null })).toBe('/games/g');
    expect(finishedRailGamePath({ id: 'g', isPublic: false, viewerIsPlaying: false, league })).toBe(
      '/games/season-1',
    );
    // Players can read their own fixture.
    expect(finishedRailGamePath({ id: 'g', isPublic: false, viewerIsPlaying: true, league })).toBe('/games/g');
  });

  it('uses only logical spacing so the carousel mirrors in RTL', () => {
    const container = render(<LiveNowRail games={[game('g1'), game('g2')]} onOpen={() => {}} />);
    const html = container.innerHTML;
    expect(html).not.toMatch(/class="[^"]*\b(ml|mr|pl|pr)-\d/);
    expect(html).not.toMatch(/class="[^"]*\btext-(left|right)\b/);
  });
});
