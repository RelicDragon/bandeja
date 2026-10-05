import { describe, expect, it } from 'vitest';
import {
  NOVICE_FEATURE_MIN_RANK,
  NOVICE_FEATURES,
  NOVICE_MAX_RANK,
  NOVICE_RANKS,
  NOVICE_REGULAR_THRESHOLD,
  featuresUnlockedAtRank,
  featuresUnlockedBetween,
  hasNoviceFeature,
  hasPendingNoviceCelebration,
  isNewcomerUser,
  isNoviceModeActive,
  noviceProgressToRegular,
  noviceRankForCount,
  noviceRankId,
} from './index';

describe('novice ranks', () => {
  it('has six ranks with thresholds 0..5 and Regular at 5', () => {
    expect(NOVICE_RANKS.map((r) => r.id)).toEqual([
      'newcomer',
      'debut',
      'rookie',
      'contender',
      'challenger',
      'regular',
    ]);
    expect(NOVICE_RANKS.map((r) => r.minCountedGames)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(NOVICE_REGULAR_THRESHOLD).toBe(5);
    expect(NOVICE_MAX_RANK).toBe(5);
  });

  it('maps counted games to a rank, capped at Regular', () => {
    expect(noviceRankForCount(0)).toBe(0);
    expect(noviceRankForCount(-3)).toBe(0);
    expect(noviceRankForCount(Number.NaN)).toBe(0);
    expect(noviceRankForCount(1)).toBe(1);
    expect(noviceRankForCount(4)).toBe(4);
    expect(noviceRankForCount(5)).toBe(5);
    expect(noviceRankForCount(500)).toBe(5);
  });

  it('resolves rank ids with clamping', () => {
    expect(noviceRankId(0)).toBe('newcomer');
    expect(noviceRankId(5)).toBe('regular');
    expect(noviceRankId(9)).toBe('regular');
    expect(noviceRankId(-1)).toBe('newcomer');
  });

  it('reports progress toward Regular', () => {
    expect(noviceProgressToRegular(0)).toEqual({ current: 0, target: 5 });
    expect(noviceProgressToRegular(3)).toEqual({ current: 3, target: 5 });
    expect(noviceProgressToRegular(12)).toEqual({ current: 5, target: 5 });
    expect(noviceProgressToRegular(null)).toEqual({ current: 0, target: 5 });
  });
});

describe('novice mode gating', () => {
  it('is never active for payloads without novice fields (old API, guest)', () => {
    expect(isNoviceModeActive(null)).toBe(false);
    expect(isNoviceModeActive(undefined)).toBe(false);
    expect(isNoviceModeActive({})).toBe(false);
    expect(hasNoviceFeature({}, 'ads')).toBe(true);
  });

  it('is active below Regular unless everything was unlocked', () => {
    expect(isNoviceModeActive({ noviceRank: 0 })).toBe(true);
    expect(isNoviceModeActive({ noviceRank: 4 })).toBe(true);
    expect(isNoviceModeActive({ noviceRank: 5 })).toBe(false);
    expect(isNoviceModeActive({ noviceRank: 2, noviceUnlockedAllAt: '2026-10-05T00:00:00Z' })).toBe(
      false,
    );
    expect(isNewcomerUser({ noviceRank: 1, noviceUnlockedAllAt: null })).toBe(true);
  });

  it('unlocks features by rank', () => {
    expect(hasNoviceFeature({ noviceRank: 0 }, 'homeShell')).toBe(false);
    expect(hasNoviceFeature({ noviceRank: 1 }, 'homeShell')).toBe(true);
    expect(hasNoviceFeature({ noviceRank: 1 }, 'chatsTab')).toBe(false);
    expect(hasNoviceFeature({ noviceRank: 2 }, 'createGame')).toBe(true);
    expect(hasNoviceFeature({ noviceRank: 3 }, 'topTab')).toBe(true);
    expect(hasNoviceFeature({ noviceRank: 3 }, 'marketTab')).toBe(false);
    expect(hasNoviceFeature({ noviceRank: 4 }, 'ads')).toBe(false);
    expect(hasNoviceFeature({ noviceRank: 5 }, 'ads')).toBe(true);
    expect(hasNoviceFeature({ noviceRank: 0, noviceUnlockedAllAt: new Date() }, 'wallet')).toBe(
      true,
    );
  });

  it('every feature unlocks at some rank between Debut and Regular', () => {
    for (const feature of NOVICE_FEATURES) {
      const min = NOVICE_FEATURE_MIN_RANK[feature];
      expect(min).toBeGreaterThanOrEqual(1);
      expect(min).toBeLessThanOrEqual(NOVICE_MAX_RANK);
    }
  });

  it('lists features revealed at a rank and across a multi-rank jump', () => {
    expect(featuresUnlockedAtRank(0)).toEqual([]);
    expect(featuresUnlockedAtRank(1)).toEqual(['homeShell', 'findTab', 'calendar', 'pastGames']);
    expect(featuresUnlockedAtRank(5)).toEqual(['aiAssistant', 'wallet', 'createLeague', 'ads']);
    expect(featuresUnlockedBetween(0, 2)).toEqual([
      ...featuresUnlockedAtRank(1),
      ...featuresUnlockedAtRank(2),
    ]);
    expect(featuresUnlockedBetween(3, 3)).toEqual([]);
    const all = featuresUnlockedBetween(0, 5);
    expect(new Set(all)).toEqual(new Set(NOVICE_FEATURES));
  });

  it('detects a pending celebration', () => {
    expect(hasPendingNoviceCelebration({ noviceRank: 2, noviceMilestoneSeenRank: 1 })).toBe(true);
    expect(hasPendingNoviceCelebration({ noviceRank: 2, noviceMilestoneSeenRank: 2 })).toBe(false);
    expect(hasPendingNoviceCelebration({ noviceRank: 5, noviceMilestoneSeenRank: 4 })).toBe(true);
    expect(
      hasPendingNoviceCelebration({
        noviceRank: 3,
        noviceMilestoneSeenRank: 1,
        noviceUnlockedAllAt: '2026-10-05T00:00:00Z',
      }),
    ).toBe(false);
    expect(hasPendingNoviceCelebration({})).toBe(false);
  });
});
