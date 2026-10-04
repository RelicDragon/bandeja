// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MotionGlobalConfig } from 'framer-motion';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}));

vi.mock('@/store/authStore', async () => {
  const { create } = await import('zustand');
  return {
    useAuthStore: create(() => ({ user: null as Record<string, unknown> | null, isInitializing: false })),
  };
});

const novice = vi.hoisted(() => ({ markNoviceMilestoneSeen: vi.fn() }));
vi.mock('@/hooks/useNovice', () => ({ markNoviceMilestoneSeen: novice.markNoviceMilestoneSeen }));

const details = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('./loadNoviceCelebrationDetails', () => ({
  loadNoviceCelebrationDetails: details.load,
}));

vi.mock('@/hooks/useBackButtonModal', () => ({ useBackButtonModal: () => {} }));
vi.mock('@/utils/haptics', () => ({ hapticSelection: () => {}, hapticSuccess: () => {} }));
vi.mock('@/components/trophies/TrophyArt', () => ({ TrophyArt: () => null }));
vi.mock('@/components/trophies/TrophyRarityFrame', () => ({
  TrophyRarityFrame: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { useAuthStore } from '@/store/authStore';
import {
  claimCelebration,
  markCelebrationShown,
  wasCelebrationShown,
} from '@/components/trophies/trophyCelebrationGate';
import { NoviceCelebrationHost } from './NoviceCelebrationHost';
import { resetNoviceCelebrationSessionForTests } from './noviceCelebrationSession';

type NoviceUser = {
  id: string;
  noviceRank: number;
  noviceMilestoneSeenRank: number;
  noviceCountedGames: number;
  noviceUnlockedAllAt: string | null;
};

const setUser = (user: NoviceUser | null) =>
  act(() => {
    (useAuthStore as unknown as { setState: (s: unknown) => void }).setState({ user });
  });

const getUser = () =>
  (useAuthStore as unknown as { getState: () => { user: NoviceUser | null } }).getState().user;

function novUser(overrides: Partial<NoviceUser> = {}): NoviceUser {
  return {
    id: 'me',
    noviceRank: 1,
    noviceMilestoneSeenRank: 0,
    noviceCountedGames: 1,
    noviceUnlockedAllAt: null,
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

const overlay = () => document.querySelector('[data-testid="novice-celebration"]');
const continueBtn = () =>
  document.querySelector<HTMLButtonElement>('[data-testid="novice-celebration-continue"]');

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mount() {
  act(() => root.render(<NoviceCelebrationHost />));
  await flush();
}

/** Click Continue through every step; returns the step headings seen. */
async function playThrough(): Promise<string[]> {
  const seen: string[] = [];
  for (let i = 0; i < 10 && overlay(); i += 1) {
    seen.push(document.querySelector('h2')?.textContent ?? '');
    act(() => continueBtn()?.click());
    await flush();
  }
  return seen;
}

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});

beforeEach(() => {
  resetNoviceCelebrationSessionForTests();
  localStorage.clear();
  details.load.mockReset().mockResolvedValue({ result: null, achievements: [] });
  novice.markNoviceMilestoneSeen.mockReset().mockImplementation(async (rank: number) => {
    const u = getUser();
    if (u) setUser({ ...u, noviceMilestoneSeenRank: Math.max(u.noviceMilestoneSeenRank, rank) });
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  act(() => root.unmount());
  container.remove();
  setUser(null);
});

describe('NoviceCelebrationHost', () => {
  it('single rank: congrats → rank-up → reveal, then acks once', async () => {
    setUser(novUser());
    await mount();
    expect(overlay()).not.toBeNull();

    const headings = await playThrough();
    expect(headings).toHaveLength(3);
    expect(headings[0]).toBe('novice.celebration.congrats.firstTitle');
    expect(headings[1]).toContain('novice.celebration.rankUp.title');
    expect(headings[2]).toBe('novice.celebration.features.title');

    expect(overlay()).toBeNull();
    expect(novice.markNoviceMilestoneSeen).toHaveBeenCalledTimes(1);
    expect(novice.markNoviceMilestoneSeen).toHaveBeenCalledWith(1);

    // Server ack landed: nothing replays on later profile refreshes.
    setUser({ ...getUser()!, noviceCountedGames: 1 });
    await flush();
    expect(overlay()).toBeNull();
    expect(details.load).toHaveBeenCalledTimes(1);
  });

  it('multi-rank jump plays one combined sequence and acks the highest rank', async () => {
    setUser(novUser({ noviceRank: 3, noviceMilestoneSeenRank: 1, noviceCountedGames: 3 }));
    await mount();
    expect(document.querySelectorAll('[data-testid="novice-celebration"]')).toHaveLength(1);

    act(() => continueBtn()?.click());
    await flush();
    expect(document.querySelector('[data-testid="novice-celebration-jump"]')).not.toBeNull();
    // Old emblem first, then it lands on the new rank.
    expect(document.querySelector('[data-testid="novice-rank-emblem-1"]')).not.toBeNull();
    await act(() => new Promise((resolve) => setTimeout(resolve, 800)));
    expect(document.querySelector('[data-testid="novice-rank-emblem-3"]')).not.toBeNull();

    act(() => continueBtn()?.click());
    await flush();
    expect(document.querySelector('[data-testid="novice-feature-chatsTab"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="novice-feature-topTab"]')).not.toBeNull();

    act(() => continueBtn()?.click());
    await flush();
    expect(overlay()).toBeNull();
    expect(novice.markNoviceMilestoneSeen).toHaveBeenCalledTimes(1);
    expect(novice.markNoviceMilestoneSeen).toHaveBeenCalledWith(3);
  });

  it('Regular finale ends on "the full app is yours"', async () => {
    setUser(novUser({ noviceRank: 5, noviceMilestoneSeenRank: 4, noviceCountedGames: 5 }));
    await mount();
    const headings = await playThrough();
    expect(headings[headings.length - 1]).toBe('novice.celebration.features.regularTitle');
    expect(novice.markNoviceMilestoneSeen).toHaveBeenCalledWith(5);
  });

  it('never plays for unlock-all users or an acknowledged rank', async () => {
    setUser(novUser({ noviceRank: 2, noviceUnlockedAllAt: '2026-10-01T00:00:00.000Z' }));
    await mount();
    expect(overlay()).toBeNull();
    setUser(novUser({ noviceRank: 2, noviceMilestoneSeenRank: 2 }));
    await flush();
    expect(overlay()).toBeNull();
    expect(details.load).not.toHaveBeenCalled();
  });

  it('a failed ack does not replay the sequence in the same session', async () => {
    novice.markNoviceMilestoneSeen.mockRejectedValueOnce(new Error('offline'));
    setUser(novUser());
    await mount();
    await playThrough();
    expect(overlay()).toBeNull();
    setUser({ ...getUser()! });
    await flush();
    expect(overlay()).toBeNull();
    expect(novice.markNoviceMilestoneSeen).toHaveBeenCalledTimes(1);
  });

  it('waits for an open trophy sheet, then takes priority over the next one', async () => {
    expect(claimCelebration('trophy-open')).toBe(true);
    setUser(novUser());
    await mount();
    expect(overlay()).toBeNull();

    act(() => markCelebrationShown('trophy-open'));
    await flush();
    expect(overlay()).not.toBeNull();
    // Trophy sheets wait while the novice sequence holds the gate.
    expect(claimCelebration('trophy-next')).toBe(false);

    await playThrough();
    expect(overlay()).toBeNull();
    expect(claimCelebration('trophy-next')).toBe(true);
    markCelebrationShown('trophy-next');
  });

  it('marks celebrated achievements so the trophy sheet does not repeat them', async () => {
    details.load.mockResolvedValue({
      result: { gameId: 'g1', levelBefore: 1.5, levelAfter: 1.62, wins: 2, ties: 0, losses: 1, isWinner: true },
      achievements: [
        { definitionId: 'habit_first', titleKey: 'trophies.first', artKey: 'x', rarity: 'COMMON', achievementId: 'ach-1' },
      ],
    });
    setUser(novUser());
    await mount();
    expect(document.querySelector('[data-testid="novice-celebration-result"]')).not.toBeNull();
    const headings = await playThrough();
    expect(headings[1]).toBe('novice.celebration.achievements.titleOne');
    expect(wasCelebrationShown('ach-1')).toBe(true);
  });
});
