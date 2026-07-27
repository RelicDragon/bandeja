import assert from 'node:assert/strict';
import { computeHabitCrossingDates, type HabitCrossingEvent } from './habitCrossingDates';

const TZ = 'UTC';

function ev(
  partial: Omit<HabitCrossingEvent, 'qualifiesForStreak' | 'gamesPlayedDelta' | 'gamesWonDelta'> &
    Partial<Pick<HabitCrossingEvent, 'qualifiesForStreak' | 'gamesPlayedDelta' | 'gamesWonDelta'>>,
): HabitCrossingEvent {
  return {
    gamesPlayedDelta: 1,
    gamesWonDelta: 0,
    qualifiesForStreak: true,
    ...partial,
  };
}

{
  const events: HabitCrossingEvent[] = [];
  for (let i = 1; i <= 10; i += 1) {
    events.push(
      ev({
        gameId: `g${i}`,
        sport: 'PADEL',
        at: new Date(`2024-01-${String(i).padStart(2, '0')}T12:00:00.000Z`),
        gamesWonDelta: i === 1 || i === 10 ? 1 : 0,
      }),
    );
  }
  const crossings = computeHabitCrossingDates({
    events,
    timezone: TZ,
    definitionIds: new Set(['habit_first_win', 'habit_games_10', 'habit_wins_10']),
  });
  assert.equal(crossings.get('habit_first_win')?.sourceGameId, 'g1');
  assert.equal(
    crossings.get('habit_first_win')?.earnedAt.toISOString(),
    '2024-01-01T12:00:00.000Z',
  );
  assert.equal(crossings.get('habit_games_10')?.sourceGameId, 'g10');
  assert.equal(crossings.has('habit_wins_10'), false);
}

{
  // Weekly plays advance streak; threshold 4 lands on 4th week.
  const events: HabitCrossingEvent[] = [];
  for (let week = 0; week < 4; week += 1) {
    const day = 1 + week * 7;
    events.push(
      ev({
        gameId: `s${week}`,
        sport: 'PADEL',
        at: new Date(`2024-03-${String(day).padStart(2, '0')}T15:00:00.000Z`),
      }),
    );
  }
  const crossings = computeHabitCrossingDates({
    events,
    timezone: TZ,
    definitionIds: new Set(['habit_streak_4']),
  });
  assert.equal(crossings.get('habit_streak_4')?.sourceGameId, 's3');
  assert.equal(
    crossings.get('habit_streak_4')?.earnedAt.toISOString(),
    '2024-03-22T15:00:00.000Z',
  );
}

{
  // Max across sports: TENNIS hits 4 while PADEL is lower.
  const events: HabitCrossingEvent[] = [];
  for (let week = 0; week < 4; week += 1) {
    const day = 1 + week * 7;
    events.push(
      ev({
        gameId: `t${week}`,
        sport: 'TENNIS',
        at: new Date(`2025-01-${String(day).padStart(2, '0')}T10:00:00.000Z`),
      }),
    );
  }
  const crossings = computeHabitCrossingDates({
    events,
    timezone: TZ,
    definitionIds: new Set(['habit_streak_4']),
  });
  assert.equal(crossings.get('habit_streak_4')?.sourceGameId, 't3');
}

console.log('habitCrossingDates.test.ts: ok');
