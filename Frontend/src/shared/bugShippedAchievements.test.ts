import { describe, expect, it } from 'vitest';
import {
  BUG_SHIPPED_THRESHOLDS,
  ACHIEVEMENT_CATALOG,
  filterThresholdDefinitionsDue,
  bugTypeCountsForShippedAchievement,
  isBugEligibleForShippedAchievement,
} from '@shared/achievements';

describe('bug shipped achievement ladder', () => {
  it('catalog thresholds and rarities', () => {
    const defs = ACHIEVEMENT_CATALOG.filter((d) => d.ruleKind === 'HABIT_BUG_SHIPPED');
    expect(defs.map((d) => [d.threshold, d.rarity, d.type])).toEqual([
      [1, 'COMMON', 'MILESTONE'],
      [5, 'COMMON', 'MILESTONE'],
      [10, 'RARE', 'MILESTONE'],
      [25, 'RARE', 'MILESTONE'],
      [50, 'LEGENDARY', 'MILESTONE'],
    ]);
    expect([...BUG_SHIPPED_THRESHOLDS]).toEqual([1, 5, 10, 25, 50]);
  });

  it('excludes questions; requires workflow middle + terminal', () => {
    expect(bugTypeCountsForShippedAchievement('QUESTION')).toBe(false);
    expect(
      isBugEligibleForShippedAchievement({
        bugType: 'BUG',
        status: 'FINISHED',
        inProgressReachedAt: new Date(),
      }),
    ).toBe(true);
    expect(
      isBugEligibleForShippedAchievement({
        bugType: 'BUG',
        status: 'FINISHED',
        inProgressReachedAt: null,
        testingStartedAt: null,
      }),
    ).toBe(false);
  });

  it('crosses thresholds forward-only', () => {
    const due = filterThresholdDefinitionsDue({
      definitions: ACHIEVEMENT_CATALOG,
      ruleKind: 'HABIT_BUG_SHIPPED',
      before: 4,
      after: 5,
      ownedDefinitionIds: new Set(['habit_bug_shipped_1']),
    }).map((d) => d.id);
    expect(due).toEqual(['habit_bug_shipped_5']);
  });
});
