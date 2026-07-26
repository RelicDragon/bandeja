import assert from 'node:assert/strict';
import {
  ACHIEVEMENT_CATALOG,
  getAchievementDefinition,
  projectTrophyCabinet,
  resolveTrophyShowcase,
} from '@bandeja/shared/achievements';
import {
  catalogDefinitionCount,
  countersFromSportProfiles,
  emptyTrophiesPayload,
} from './achievementProjection.service';

{
  assert.equal(catalogDefinitionCount(), ACHIEVEMENT_CATALOG.length);
  assert.ok(getAchievementDefinition('podium_gold')?.rarity === 'LEGENDARY');
  assert.ok(getAchievementDefinition('podium_silver')?.place === 2);
  assert.ok(getAchievementDefinition('habit_streak_4')?.threshold === 4);
  assert.ok(getAchievementDefinition('habit_streak_8')?.threshold === 8);
  assert.ok(getAchievementDefinition('habit_streak_12')?.threshold === 12);
  assert.ok(getAchievementDefinition('habit_streak_16')?.threshold === 16);
  assert.ok(getAchievementDefinition('habit_streak_32')?.threshold === 32);
  assert.ok(getAchievementDefinition('habit_streak_64')?.threshold === 64);
  assert.ok(getAchievementDefinition('habit_streak_64')?.rarity === 'LEGENDARY');
  assert.ok(getAchievementDefinition('habit_games_10')?.threshold === 10);
  assert.ok(getAchievementDefinition('habit_games_50')?.threshold === 50);
  assert.ok(getAchievementDefinition('habit_games_100')?.threshold === 100);
  assert.ok(getAchievementDefinition('habit_games_500')?.threshold === 500);
  assert.ok(getAchievementDefinition('habit_games_500')?.rarity === 'RARE');
  assert.ok(getAchievementDefinition('habit_games_1000')?.threshold === 1000);
  assert.ok(getAchievementDefinition('habit_games_1000')?.rarity === 'LEGENDARY');
  assert.ok(getAchievementDefinition('habit_first_win')?.ruleKind === 'HABIT_FIRST_WIN');
  assert.ok(getAchievementDefinition('habit_wins_10')?.threshold === 10);
  assert.ok(getAchievementDefinition('habit_wins_25')?.threshold === 25);
  assert.ok(getAchievementDefinition('habit_wins_50')?.rarity === 'RARE');
  assert.ok(getAchievementDefinition('habit_wins_100')?.threshold === 100);
  assert.ok(getAchievementDefinition('habit_wins_500')?.rarity === 'LEGENDARY');
}

{
  const own = emptyTrophiesPayload(true);
  assert.equal(own.cabinet.length, ACHIEVEMENT_CATALOG.length);
  assert.equal(own.unlockedCount, 0);
  assert.equal(own.pinsEditable, true);
  assert.deepEqual(own.pinnedInstanceIds, []);
  assert.equal(own.showcase.length, 3);
  assert.ok(own.showcase.every((s) => s.instance == null));
  assert.ok(own.cabinet.every((r) => !r.unlocked));

  const visitor = emptyTrophiesPayload(false);
  assert.equal(visitor.cabinet.length, 0);
  assert.equal(visitor.pinsEditable, false);
}

{
  const counters = countersFromSportProfiles([
    { gamesPlayed: 4, gamesWon: 1, playStreakBest: 3, playStreakCount: 2 },
    { gamesPlayed: 6, gamesWon: 2, playStreakBest: 5, playStreakCount: 0 },
  ]);
  assert.equal(counters.gamesFinished, 10);
  assert.equal(counters.gamesWon, 3);
  // Current count only (max 2, 0) — lifetime best 5 must not inflate streak habits.
  assert.equal(counters.streakBest, 2);

  const ownProgress = projectTrophyCabinet({
    isOwner: true,
    instances: [],
    counters,
  });
  const streak4 = ownProgress.find((r) => r.definition.id === 'habit_streak_4');
  assert.deepEqual(streak4?.progress, { current: 2, target: 4 });
  const games10 = ownProgress.find((r) => r.definition.id === 'habit_games_10');
  assert.deepEqual(games10?.progress, { current: 10, target: 10 });
}

{
  const visitorUnlocked = projectTrophyCabinet({
    isOwner: false,
    instances: [
      {
        id: 'a1',
        definitionId: 'habit_first_win',
        earnedAt: '2026-07-01T00:00:00.000Z',
      },
    ],
    counters: { streakBest: 0, gamesFinished: 0, gamesWon: 0 },
  });
  assert.equal(visitorUnlocked.length, 1);
  assert.equal(visitorUnlocked[0].definition.id, 'habit_first_win');
}

{
  const slots = resolveTrophyShowcase({
    instances: [
      {
        id: 'new',
        definitionId: 'habit_streak_8',
        earnedAt: '2026-03-01T00:00:00.000Z',
      },
      {
        id: 'gold',
        definitionId: 'podium_gold',
        earnedAt: '2026-02-01T00:00:00.000Z',
      },
    ],
    pins: [{ slot: 1, achievementId: 'gold' }],
  });
  assert.equal(slots[1].instance?.id, 'gold');
  assert.equal(slots[1].pinned, true);
  assert.equal(slots[0].instance?.id, 'new');
  assert.equal(slots[0].pinned, false);
}

console.log('achievementProjection.service.test.ts: ok');
