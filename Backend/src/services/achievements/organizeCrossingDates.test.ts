import assert from 'node:assert/strict';
import { replayOrganizeCrossingDates } from './organizeCrossingDates';
import { compareByAchievementPlayAt, achievementPlayAt } from './achievementPlayAt';

{
  // Prod-shaped bug: finishedDate ASC puts null-finishedDate games last, but
  // playAt falls back to an earlier endTime → inverted ladder earnedAt.
  const earlyNullFinished = {
    id: 'early',
    entityType: 'GAME',
    finishedDate: null,
    endTime: new Date('2026-01-08T09:30:00.000Z'),
    startTime: new Date('2026-01-08T08:00:00.000Z'),
    createdAt: new Date('2026-01-07T20:00:00.000Z'),
  };
  const laterWithFinished = {
    id: 'later',
    entityType: 'GAME',
    finishedDate: new Date('2026-01-24T14:36:17.568Z'),
    endTime: new Date('2026-01-24T13:30:00.000Z'),
    startTime: new Date('2026-01-24T12:00:00.000Z'),
    createdAt: new Date('2026-01-23T22:00:00.000Z'),
  };

  // Wrong DB order (finishedDate ASC, nulls last): later first, early last.
  const wrongDbOrder = [laterWithFinished, earlyNullFinished];
  assert.equal(
    achievementPlayAt(earlyNullFinished).getTime() <
      achievementPlayAt(laterWithFinished).getTime(),
    true,
  );
  assert.equal(compareByAchievementPlayAt(earlyNullFinished, laterWithFinished) < 0, true);

  const crossings = replayOrganizeCrossingDates({
    rows: wrongDbOrder,
    definitionIds: new Set(['habit_org_game_1', 'habit_org_game_10']),
  });

  // Build 10 GAME rows so threshold 10 can fire; first is early null-finished.
  const tenGames = [
    earlyNullFinished,
    ...Array.from({ length: 9 }, (_, i) => ({
      id: `g${i + 2}`,
      entityType: 'GAME',
      finishedDate: new Date(`2026-02-${String(i + 1).padStart(2, '0')}T12:00:00.000Z`),
      endTime: new Date(`2026-02-${String(i + 1).padStart(2, '0')}T11:00:00.000Z`),
      startTime: new Date(`2026-02-${String(i + 1).padStart(2, '0')}T10:00:00.000Z`),
      createdAt: new Date(`2026-02-${String(i + 1).padStart(2, '0')}T09:00:00.000Z`),
    })),
  ];

  const ladder = replayOrganizeCrossingDates({
    rows: [...tenGames].reverse(), // deliberately reverse chronological insert order
    definitionIds: new Set(['habit_org_game_1', 'habit_org_game_10']),
  });

  assert.equal(ladder.get('habit_org_game_1')?.sourceGameId, 'early');
  assert.equal(
    ladder.get('habit_org_game_1')?.earnedAt.toISOString(),
    '2026-01-08T09:30:00.000Z',
  );
  assert.equal(ladder.get('habit_org_game_10')?.sourceGameId, 'g10');
  assert.ok(
    ladder.get('habit_org_game_1')!.earnedAt.getTime() <
      ladder.get('habit_org_game_10')!.earnedAt.getTime(),
  );

  // Two-threshold smoke from wrongDbOrder alone (only 2 games → org_1 only).
  assert.equal(crossings.get('habit_org_game_1')?.sourceGameId, 'early');
  assert.equal(crossings.has('habit_org_game_10'), false);
}

console.log('organizeCrossingDates.test.ts: ok');
