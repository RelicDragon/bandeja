import assert from 'node:assert/strict';
import {
  timeStringToMinutes,
  datesIntersect,
  clubsIntersect,
  timeWindowsIntersect,
  resolveTimeWindow,
  intentsCompatible,
  intentMatchesGame,
  affinityScore,
  buildRematchKey,
  type IntentCriteria,
} from './playIntentCriteria';
import {
  gameStartIsFuture,
  futureGameDateBounds,
  intentWindowEndsAt,
  intentWindowIsReachable,
  nextSuggestedStart,
  proposalWindowSource,
} from './playIntentFreshness';

function base(overrides: Partial<IntentCriteria> = {}): IntentCriteria {
  return {
    dateKeys: ['2026-07-28'],
    clubIds: [],
    minLevel: null,
    maxLevel: null,
    timeOfDay: 'ANYTIME',
    startTime: null,
    endTime: null,
    genderTeams: 'ANY',
    userLevel: 3,
    userGender: 'MALE',
    ...overrides,
  };
}

assert.equal(timeStringToMinutes('24:00'), 1440);
assert.equal(timeStringToMinutes('18:30'), 18 * 60 + 30);

assert.deepEqual(datesIntersect(['2026-07-28', '2026-07-29'], ['2026-07-29']), ['2026-07-29']);
assert.deepEqual(datesIntersect(['2026-07-28'], ['2026-07-30']), []);

assert.deepEqual(clubsIntersect([], []), []);
assert.deepEqual(clubsIntersect(['a'], []), ['a']);
assert.deepEqual(clubsIntersect(['a', 'b'], ['b', 'c']), ['b']);
assert.equal(clubsIntersect(['a'], ['b']), null);

assert.equal(timeWindowsIntersect(null, null), null);
assert.deepEqual(timeWindowsIntersect({ startMinutes: 600, endMinutes: 720 }, null), {
  startMinutes: 600,
  endMinutes: 720,
});
assert.deepEqual(
  timeWindowsIntersect({ startMinutes: 600, endMinutes: 720 }, { startMinutes: 700, endMinutes: 800 }),
  { startMinutes: 700, endMinutes: 720 },
);
assert.equal(
  timeWindowsIntersect({ startMinutes: 600, endMinutes: 700 }, { startMinutes: 700, endMinutes: 800 }),
  null,
);

assert.deepEqual(resolveTimeWindow({ timeOfDay: 'MORNING' }), { startMinutes: 360, endMinutes: 720 });
assert.equal(resolveTimeWindow({ timeOfDay: 'ANYTIME' }), null);
assert.deepEqual(resolveTimeWindow({ timeOfDay: 'CUSTOM', startTime: '10:00', endTime: '12:00' }), {
  startMinutes: 600,
  endMinutes: 720,
});

{
  const a = base({ clubIds: ['c1'], timeOfDay: 'EVENING' });
  const b = base({ clubIds: ['c1'], timeOfDay: 'EVENING', userLevel: 3.5 });
  assert.equal(intentsCompatible(a, b).ok, true);
  const c = base({ clubIds: ['c2'], dateKeys: ['2026-07-29'] });
  assert.equal(intentsCompatible(a, c).ok, false);
}

{
  const intent = base({
    timeOfDay: 'CUSTOM',
    startTime: '17:00',
    endTime: '21:00',
    clubIds: ['club1'],
    minLevel: 2,
    maxLevel: 5,
  });
  const now = new Date('2026-07-28T12:00:00Z');
  const gameStart = new Date('2026-07-28T18:00:00Z');
  assert.equal(
    intentMatchesGame(
      intent,
      {
        dateKey: '2026-07-28',
        clubId: 'club1',
        startTime: gameStart,
        startTimeMinutes: 18 * 60,
        minLevel: 2.5,
        maxLevel: 4,
        genderTeams: 'ANY',
      },
      now,
    ),
    true,
  );
  assert.equal(
    intentMatchesGame(
      intent,
      {
        dateKey: '2026-07-28',
        clubId: 'other',
        startTime: gameStart,
        startTimeMinutes: 18 * 60,
        minLevel: 2.5,
        maxLevel: 4,
        genderTeams: 'ANY',
      },
      now,
    ),
    false,
  );
  assert.equal(
    intentMatchesGame(
      intent,
      {
        dateKey: '2026-07-28',
        clubId: 'club1',
        startTime: gameStart,
        startTimeMinutes: 18 * 60,
        minLevel: 2.5,
        maxLevel: 4,
        genderTeams: 'ANY',
      },
      new Date('2026-07-28T18:30:00Z'),
    ),
    false,
  );
}

{
  const timezone = 'UTC';
  const intent = { dateKeys: ['2026-07-28'], timeOfDay: 'MORNING' as const, startTime: null, endTime: null };
  assert.equal(intentWindowIsReachable(intent, timezone, new Date('2026-07-28T07:00:00Z')), true);
  assert.equal(intentWindowIsReachable(intent, timezone, new Date('2026-07-28T18:00:00Z')), false);
  assert.equal(
    intentWindowIsReachable(
      { ...intent, dateKeys: ['2026-07-28', '2026-07-29'] },
      timezone,
      new Date('2026-07-28T18:00:00Z'),
    ),
    true,
  );
  assert.equal(
    intentWindowIsReachable(
      { ...intent, timeOfDay: 'ANYTIME' },
      timezone,
      new Date('2026-07-28T18:00:00Z'),
    ),
    true,
  );
  assert.equal(
    intentWindowIsReachable(
      intent,
      timezone,
      new Date('2026-07-28T12:00:00Z'),
    ),
    false,
  );
  assert.equal(
    intentWindowEndsAt(intent, 'Europe/Belgrade')?.toISOString(),
    '2026-07-28T10:00:00.000Z',
  );
}

{
  const now = new Date('2026-07-28T18:07:00Z');
  const source = proposalWindowSource({
    dateKeys: ['2026-07-28'],
    startTime: '17:00',
    endTime: '21:00',
  });
  assert.equal(
    nextSuggestedStart(source, 'UTC', now)?.toISOString(),
    '2026-07-28T18:30:00.000Z',
  );
  assert.equal(
    nextSuggestedStart(source, 'UTC', new Date('2026-07-28T18:15:00Z'))?.toISOString(),
    '2026-07-28T18:30:00.000Z',
  );
  assert.equal(
    nextSuggestedStart(
      {
        dateKeys: ['2026-07-28'],
        timeOfDay: 'MORNING',
        startTime: null,
        endTime: null,
      },
      'UTC',
      new Date('2026-07-28T18:00:00Z'),
    ),
    null,
  );
  assert.equal(gameStartIsFuture(new Date('2026-07-28T18:00:01Z'), new Date('2026-07-28T18:00:00Z')), true);
  assert.equal(gameStartIsFuture(new Date('2026-07-28T18:00:00Z'), new Date('2026-07-28T18:00:00Z')), false);
  assert.equal(
    nextSuggestedStart(
      proposalWindowSource({
        dateKeys: ['2026-03-08'],
        startTime: '02:30',
        endTime: '03:00',
      }),
      'America/New_York',
      new Date('2026-03-08T05:00:00Z'),
    ),
    null,
  );
  const bounds = futureGameDateBounds(
    ['2026-07-28', '2026-07-29'],
    'UTC',
    new Date('2026-07-28T18:00:00Z'),
  );
  assert.equal(bounds.length, 2);
  assert.equal('gt' in bounds[0] && bounds[0].gt.toISOString(), '2026-07-28T18:00:00.000Z');
  assert.equal('gte' in bounds[1] && bounds[1].gte.toISOString(), '2026-07-29T00:00:00.000Z');
  assert.equal(
    bounds.some(
      (bound) =>
        ('gt' in bound
          ? new Date('2026-07-28T10:00:00Z') > bound.gt
          : new Date('2026-07-28T10:00:00Z') >= bound.gte) &&
        new Date('2026-07-28T10:00:00Z') <= bound.lte,
    ),
    false,
  );
  assert.equal(
    new Date('2026-07-29T00:00:00Z') >=
      ('gte' in bounds[1] ? bounds[1].gte : bounds[1].gt),
    true,
  );
}

{
  const a = base({ clubIds: ['c1'], timeOfDay: 'EVENING' });
  const b = base({ clubIds: ['c1'], timeOfDay: 'EVENING' });
  const aff = affinityScore(a, b);
  assert.ok(['near', 'mid', 'far'].includes(aff.bucket));
  assert.equal(buildRematchKey(['b', 'a', 'c']), 'a|b|c');
}

{
  const a = base({ timeOfDay: 'ANYTIME' });
  const b = base({ timeOfDay: 'ANYTIME' });
  const aff = affinityScore(a, b);
  assert.ok(aff.score >= 2);
  assert.equal(aff.bucket, 'mid');
}

{
  const a = base({ dateKeys: ['2026-07-28'], timeOfDay: 'ANYTIME' });
  const b = base({ dateKeys: ['2026-07-29'], timeOfDay: 'ANYTIME' });
  assert.equal(affinityScore(a, b).bucket, 'far');
}

console.log('playIntentCriteria.test.ts: ok');
