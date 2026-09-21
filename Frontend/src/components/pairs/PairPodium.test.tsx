// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key}:${JSON.stringify(options)}` : key,
    i18n: { language: 'en' },
  }),
}));

vi.mock('@/hooks/usePrefersReducedMotion', () => ({
  usePrefersReducedMotion: () => false,
}));

// PRD 355 — `PairAvatars` renders equipped frames, and the store behind them
// reaches `api/axios` at module load. Isolated here for the same reason every
// other store this tree touches is, and because the partial `react-i18next`
// mock above cannot satisfy `i18n/config`.
vi.mock('@/features/collection/useEquippedGoods', () => ({
  useFrameClass: () => null,
  useNameColorClass: () => null,
  usePrefetchEquippedGoods: () => {},
}));

import type { PairEntry, PairMember } from '@/api/pairs';
import { PairPodium } from './PairPodium';

function member(id: string, firstName: string): PairMember {
  return {
    id,
    firstName,
    lastName: null,
    avatar: null,
    isPremium: false,
    showPremiumStatus: false,
    level: 4,
  };
}

function entry(rank: number, a: string, b: string, winRate: number): PairEntry {
  return {
    pairId: `${a},${b}`,
    rank,
    userA: member(a, a),
    userB: member(b, b),
    games: 10 + rank,
    wins: 5,
    winRate,
    combinedLevel: 4,
    chemistry: 9,
    lastPlayedAt: null,
    isViewerPair: false,
    teamId: null,
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(pairs: PairEntry[]) {
  act(() => {
    root.render(<PairPodium pairs={pairs} onOpen={() => {}} />);
  });
}

const PAIRS = [entry(1, 'ana', 'marko', 82), entry(2, 'ben', 'zora', 71), entry(3, 'cara', 'dino', 64)];

describe('PairPodium (PRD 352)', () => {
  it('draws the top three in rank order, tallest first', () => {
    render(PAIRS);
    const cards = [...container.querySelectorAll<HTMLElement>('[data-testid="pair-podium-card"]')];
    expect(cards).toHaveLength(3);
    expect(cards.map((card) => card.dataset.pairId)).toEqual([
      'ana,marko',
      'ben,zora',
      'cara,dino',
    ]);

    const heights = cards.map((card) => Number.parseInt(card.style.height, 10));
    expect(heights[0]).toBeGreaterThan(heights[1]!);
    expect(heights[1]).toBeGreaterThan(heights[2]!);
  });

  it('ignores anything past third place', () => {
    render([...PAIRS, entry(4, 'eva', 'filip', 60)]);
    expect(container.querySelectorAll('[data-testid="pair-podium-card"]')).toHaveLength(3);
  });

  it('renders podium cards as buttons with a spoken rank, names, win rate and games', () => {
    render(PAIRS);
    const first = container.querySelector<HTMLElement>('[data-testid="pair-podium-card"]')!;
    expect(first.tagName).toBe('BUTTON');
    const label = first.getAttribute('aria-label')!;
    expect(label).toContain('pairs.aria.podium');
    expect(label).toContain('"rank":"1"');
    expect(label).toContain('"winRate":"82"');
    expect(label).toContain('pairs.gamesCount');
  });

  it('renders nothing when there are no pairs', () => {
    render([]);
    expect(container.querySelector('[data-testid="pair-podium"]')).toBeNull();
  });
});
