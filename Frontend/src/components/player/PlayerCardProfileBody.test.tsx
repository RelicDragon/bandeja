// @vitest-environment jsdom

import { act, type ReactNode, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TFunction } from 'i18next';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
      i18n: { language: 'en' },
    }),
  };
});

vi.mock('@/queries/useUserStatsQuery', () => ({
  useUserStatsQuery: () => ({ data: undefined }),
}));

// Not rendered in this tree, but imported transitively: stub it out so its
// module-level async idb init cannot reject in jsdom (no indexedDB).
vi.mock('@/store/audioPlaybackStore', () => ({}));

vi.mock('@/api/users', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/users')>();
  return {
    ...actual,
    usersApi: {
      ...actual.usersApi,
      getUserLevelChanges: vi.fn(async () => ({ data: [] })),
    },
  };
});

import { usersApi, type LevelHistoryItem, type UserStats } from '@/api/users';
import { MemoryRouter } from 'react-router-dom';
import {
  PlayerCardProfileBody,
  type PlayerCardProfileTab,
} from './PlayerCardProfileBody';

const roots: Root[] = [];
const containers: HTMLDivElement[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => root.unmount());
  }
  for (const container of containers.splice(0)) {
    container.remove();
  }
});

function render(node: ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  containers.push(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => {
    root.render(node);
  });
  return container;
}

const stats = {
  user: {
    id: 'u1',
    firstName: 'A',
    lastName: 'B',
    primarySport: 'PADEL',
    sportsEnabled: ['PADEL'],
    socialLevel: 1.18,
  },
  levelHistory: [],
  gamesLast30Days: 0,
  followersCount: 3,
  followingCount: 2,
  gamesStats: [],
} as unknown as UserStats;

const multiSportStats = {
  ...stats,
  user: {
    ...(stats.user as unknown as Record<string, unknown>),
    id: 'u2',
    sportsEnabled: ['PADEL', 'TABLE_TENNIS'],
  },
} as unknown as UserStats;

const noSportStats = {
  ...stats,
  user: {
    ...(stats.user as unknown as Record<string, unknown>),
    id: 'u3',
    primarySport: undefined,
    sportsEnabled: [],
  },
} as unknown as UserStats;

const historyItems: LevelHistoryItem[] = [
  {
    id: 'e1',
    levelBefore: 2.5,
    levelAfter: 2.19,
    levelChange: -0.31,
    createdAt: '2026-09-09T08:01:44.555Z',
    sport: 'PADEL',
    eventType: 'GAME',
    affectsRating: true,
  },
  {
    id: 'e2',
    levelBefore: 1,
    levelAfter: 2.5,
    levelChange: 1.5,
    createdAt: '2026-09-09T06:17:26.727Z',
    sport: 'PADEL',
    eventType: 'QUESTIONNAIRE',
    affectsRating: true,
  },
];

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', NoopResizeObserver);

const t = ((key: string) => key) as unknown as TFunction;
const noop = () => {};

function Harness({
  initialTab,
  stats: fixture = stats,
}: {
  initialTab: PlayerCardProfileTab;
  stats?: UserStats;
}) {
  const [tab, setTab] = useState<PlayerCardProfileTab>(initialTab);
  return (
    <MemoryRouter>
      <PlayerCardProfileBody
      stats={fixture}
      t={t}
      isBlocked={false}
      showProfileTabs
      showGroupsTab
      activeProfileTab={tab}
      onProfileTabChange={setTab}
      groupsContent={<div data-testid="groups-content">groups</div>}
      onAvatarClick={noop}
      onTelegramClick={noop}
      onOpenGame={noop}
      />
    </MemoryRouter>
  );
}

function profileTabLabels(el: HTMLElement) {
  const list = el.querySelector('[role="tablist"][aria-label="playerCard.profileTabs"]');
  expect(list).not.toBeNull();
  return Array.from(list!.querySelectorAll('[role="tab"]')).map((b) =>
    b.getAttribute('aria-label'),
  );
}

function selectorLists(el: HTMLElement) {
  return el.querySelectorAll('[role="tablist"][aria-label="playerCard.levelHistorySelector"]');
}

function clickTab(el: HTMLElement, label: string) {
  const button = el.querySelector(`[role="tab"][aria-label="${label}"]`);
  expect(button).not.toBeNull();
  act(() => {
    (button as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('PlayerCardProfileBody tabs', () => {
  it('statistics tab shows renamed tabs plus exactly one shared sport selector', () => {
    const el = render(<Harness initialTab="statistics" />);
    expect(profileTabLabels(el)).toEqual([
      'playerCard.statistics',
      'playerCard.chart',
      'playerCard.groups',
    ]);
    expect(selectorLists(el).length).toBe(1);
    expect(el.textContent).toContain('playerCard.followers');
    expect(el.textContent).not.toContain('playerCard.noLevelHistory');
  });

  it('chart tab renders chart content with a single selector (no duplicate panel)', () => {
    const el = render(<Harness initialTab="chart" />);
    expect(selectorLists(el).length).toBe(1);
    expect(el.textContent).toContain('playerCard.noLevelHistory');
    expect(el.textContent).not.toContain('playerCard.followers');
  });

  it('social selection survives profile tab switches', () => {
    const el = render(<Harness initialTab="statistics" />);
    clickTab(el, 'rating.socialLevel');
    const social = el.querySelector('[role="tab"][aria-label="rating.socialLevel"]');
    expect(social?.getAttribute('aria-selected')).toBe('true');
    expect(el.textContent).toContain('1.18');

    clickTab(el, 'playerCard.groups');
    expect(el.querySelector('[data-testid="groups-content"]')).not.toBeNull();
    expect(selectorLists(el).length).toBe(1);
    expect(
      el.querySelector('[role="tab"][aria-label="rating.socialLevel"]')?.getAttribute(
        'aria-selected',
      ),
    ).toBe('true');
    expect(el.textContent).toContain('1.18');
    expect(el.textContent).not.toContain('playerCard.followers');

    clickTab(el, 'playerCard.statistics');
    expect(
      el.querySelector('[role="tab"][aria-label="rating.socialLevel"]')?.getAttribute(
        'aria-selected',
      ),
    ).toBe('true');
    expect(el.textContent).toContain('1.18');
  });

  it('chart tab renders real history points, not just the empty state', async () => {
    vi.mocked(usersApi.getUserLevelChanges).mockResolvedValueOnce({
      success: true,
      data: historyItems,
    });
    const el = render(<Harness initialTab="chart" />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(el.textContent).toContain('playerCard.eventType.GAME');
    expect(el.textContent).toContain('playerCard.eventType.QUESTIONNAIRE');
    expect(el.textContent).not.toContain('playerCard.noLevelHistory');
  });

  it('multi-sport user gets one external picker plus a social-only panel toggle', () => {
    const el = render(<Harness initialTab="statistics" stats={multiSportStats} />);
    const pickers = el.querySelectorAll(
      '[role="group"][aria-label="profile.leaderboard.sportLabel"]',
    );
    expect(pickers.length).toBe(1);
    expect(pickers[0].querySelectorAll('button').length).toBe(2);
    expect(selectorLists(el).length).toBe(1);
    const panelTabs = Array.from(
      selectorLists(el)[0].querySelectorAll('[role="tab"]'),
    ).map((b) => b.getAttribute('aria-label'));
    expect(panelTabs).toEqual(['rating.socialLevel']);
  });

  it('user without competitive sports sees groups only, no tabs or panel', () => {
    const el = render(<Harness initialTab="groups" stats={noSportStats} />);
    expect(el.querySelector('[data-testid="groups-content"]')).not.toBeNull();
    expect(el.querySelectorAll('[role="tablist"]').length).toBe(0);
    expect(selectorLists(el).length).toBe(0);
  });
});
