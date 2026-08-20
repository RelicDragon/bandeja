import assert from 'node:assert/strict';
import {
  BUG_SHIPPED_THRESHOLDS,
  getAchievementDefinition,
  isBugEligibleForShippedAchievement,
} from '@bandeja/shared/achievements';
import { pickBugShippedEarnedAt } from './bugShippedGrant.service';

assert.deepEqual([...BUG_SHIPPED_THRESHOLDS], [1, 5, 10, 25, 50]);
assert.ok(getAchievementDefinition('habit_bug_shipped_1')?.type === 'MILESTONE');
assert.ok(getAchievementDefinition('habit_bug_shipped_10')?.rarity === 'RARE');
assert.ok(getAchievementDefinition('habit_bug_shipped_50')?.rarity === 'LEGENDARY');

assert.equal(
  isBugEligibleForShippedAchievement({
    bugType: 'SUGGESTION',
    status: 'ARCHIVED',
    inProgressReachedAt: null,
    testingStartedAt: new Date('2026-01-02'),
  }),
  true,
);

const earnedAt = pickBugShippedEarnedAt({
  id: 'b1',
  senderId: 'u1',
  bugType: 'BUG',
  status: 'FINISHED',
  inProgressReachedAt: null,
  testingStartedAt: new Date(),
  finishedAt: new Date('2026-03-01'),
  updatedAt: new Date('2026-03-02'),
});
assert.equal(earnedAt.toISOString(), new Date('2026-03-01').toISOString());

console.log('bugShippedGrant.service.test.ts: ok');
