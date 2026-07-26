import assert from 'node:assert/strict';
import {
  ACHIEVEMENT_CATALOG,
  habitThresholdMet,
  habitUnlocksDue,
  habitUnlocksNewlyCrossed,
} from '@bandeja/shared/achievements';
import {
  mergeHabitUnlocksMetadata,
  readHabitUnlocksFromMetadata,
} from './habitGrant.service';

{
  const none = habitUnlocksDue({
    counters: { streakBest: 0, gamesFinished: 0, gamesWon: 0 },
    ownedDefinitionIds: new Set(),
  });
  assert.equal(none.length, 0);
}

{
  const first = habitUnlocksDue({
    counters: { streakBest: 0, gamesFinished: 1, gamesWon: 1 },
    ownedDefinitionIds: new Set(),
  });
  assert.deepEqual(
    first.map((d) => d.id),
    ['habit_first_win'],
  );
}

{
  const volume = habitUnlocksDue({
    counters: { streakBest: 0, gamesFinished: 10, gamesWon: 0 },
    ownedDefinitionIds: new Set(),
  });
  assert.deepEqual(
    volume.map((d) => d.id),
    ['habit_games_10'],
  );
}

{
  const edge9 = habitUnlocksDue({
    counters: { streakBest: 0, gamesFinished: 9, gamesWon: 0 },
    ownedDefinitionIds: new Set(),
  });
  assert.equal(edge9.length, 0);

  const edge3 = habitUnlocksDue({
    counters: { streakBest: 3, gamesFinished: 0, gamesWon: 0 },
    ownedDefinitionIds: new Set(),
  });
  assert.equal(edge3.length, 0);
}

{
  const games10 = ACHIEVEMENT_CATALOG.find((d) => d.id === 'habit_games_10')!;
  assert.equal(
    habitThresholdMet(games10, { streakBest: 0, gamesFinished: 9, gamesWon: 0 }),
    false,
  );
  assert.equal(
    habitThresholdMet(games10, { streakBest: 0, gamesFinished: 10, gamesWon: 0 }),
    true,
  );
}

{
  const crossed = habitUnlocksNewlyCrossed({
    before: { streakBest: 0, gamesFinished: 9, gamesWon: 0 },
    after: { streakBest: 0, gamesFinished: 10, gamesWon: 1 },
    ownedDefinitionIds: new Set(),
  });
  assert.deepEqual(
    crossed.map((d) => d.id).sort(),
    ['habit_first_win', 'habit_games_10'].sort(),
  );
}

{
  // Historical counters already above threshold → no soft backfill on next game.
  const noBackfill = habitUnlocksNewlyCrossed({
    before: { streakBest: 12, gamesFinished: 100, gamesWon: 40 },
    after: { streakBest: 12, gamesFinished: 101, gamesWon: 41 },
    ownedDefinitionIds: new Set(),
  });
  assert.equal(noBackfill.length, 0);
}

{
  const streakCross = habitUnlocksNewlyCrossed({
    before: { streakBest: 3, gamesFinished: 5, gamesWon: 1 },
    after: { streakBest: 4, gamesFinished: 6, gamesWon: 1 },
    ownedDefinitionIds: new Set(['habit_first_win']),
  });
  assert.deepEqual(
    streakCross.map((d) => d.id),
    ['habit_streak_4'],
  );
}

{
  const ownedBlocks = habitUnlocksNewlyCrossed({
    before: { streakBest: 0, gamesFinished: 9, gamesWon: 0 },
    after: { streakBest: 0, gamesFinished: 10, gamesWon: 0 },
    ownedDefinitionIds: new Set(['habit_games_10']),
  });
  assert.equal(ownedBlocks.length, 0);
}

{
  const jump = habitUnlocksNewlyCrossed({
    before: { streakBest: 0, gamesFinished: 0, gamesWon: 0 },
    after: { streakBest: 0, gamesFinished: 100, gamesWon: 1 },
    ownedDefinitionIds: new Set(),
  });
  assert.deepEqual(
    jump.map((d) => d.id).sort(),
    ['habit_first_win', 'habit_games_10', 'habit_games_100', 'habit_games_50'].sort(),
  );
}

{
  const rareStreak = habitUnlocksNewlyCrossed({
    before: { streakBest: 7, gamesFinished: 0, gamesWon: 0 },
    after: { streakBest: 8, gamesFinished: 0, gamesWon: 0 },
    ownedDefinitionIds: new Set(['habit_streak_4']),
  });
  assert.deepEqual(
    rareStreak.map((d) => d.id),
    ['habit_streak_8'],
  );
  assert.equal(rareStreak[0]?.rarity, 'RARE');
}

{
  // Rebuilding current streak after a break: count 3→4 grants even if a high
  // lifetime best existed pre-ship (streakBest field is current count, not best).
  const rebuild = habitUnlocksNewlyCrossed({
    before: { streakBest: 3, gamesFinished: 40, gamesWon: 10 },
    after: { streakBest: 4, gamesFinished: 41, gamesWon: 10 },
    ownedDefinitionIds: new Set(['habit_first_win']),
  });
  assert.deepEqual(
    rebuild.map((d) => d.id),
    ['habit_streak_4'],
  );
}

{
  // Profile-stale trap: after "best" high must not soft-backfill when count only edged 0→1.
  const noHistoryDump = habitUnlocksNewlyCrossed({
    before: { streakBest: 0, gamesFinished: 20, gamesWon: 5 },
    after: { streakBest: 1, gamesFinished: 21, gamesWon: 5 },
    ownedDefinitionIds: new Set(),
  });
  assert.equal(noHistoryDump.length, 0);
}

{
  const meta = mergeHabitUnlocksMetadata(null, [
    {
      definitionId: 'habit_first_win',
      rarity: 'COMMON',
      artKey: 'habit_first_win',
      titleKey: 'trophies.defs.firstWin.title',
    },
  ]);
  const read = readHabitUnlocksFromMetadata(meta as object);
  assert.equal(read.length, 1);
  assert.equal(read[0]?.definitionId, 'habit_first_win');
  assert.equal(readHabitUnlocksFromMetadata(null).length, 0);
}

console.log('habitGrant.service.test.ts: ok');
