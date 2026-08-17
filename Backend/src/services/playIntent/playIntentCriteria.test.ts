import assert from 'node:assert/strict';
import {
  timeStringToMinutes,
  datesIntersect,
  clubsIntersect,
  timeWindowsIntersect,
  resolveTimeWindow,
  resolveTimeWindows,
  intentsCompatible,
  intentMatchesGame,
  intentMismatch,
  intentFitBreakdown,
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
assert.deepEqual(
  resolveTimeWindows({
    timeOfDay: 'MORNING',
    timeOfDays: ['MORNING', 'EVENING'],
  }),
  [
    { startMinutes: 360, endMinutes: 720 },
    { startMinutes: 1080, endMinutes: 1440 },
  ],
);

{
  const split = base({
    timeOfDay: 'MORNING',
    timeOfDays: ['MORNING', 'EVENING'],
  });
  assert.equal(
    intentsCompatible(split, base({ timeOfDay: 'EVENING' })).ok,
    true,
  );
  assert.equal(
    intentsCompatible(split, base({ timeOfDay: 'AFTERNOON' })).ok,
    false,
  );
}

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
  const intent = base({
    timeOfDay: 'MORNING',
    timeOfDays: ['MORNING', 'EVENING'],
  });
  const now = new Date('2026-07-28T05:00:00Z');
  const gameStart = new Date('2026-07-28T19:00:00Z');
  assert.equal(
    intentMatchesGame(
      intent,
      {
        dateKey: '2026-07-28',
        clubId: null,
        startTime: gameStart,
        startTimeMinutes: 19 * 60,
        minLevel: null,
        maxLevel: null,
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
        clubId: null,
        startTime: new Date('2026-07-28T15:00:00Z'),
        startTimeMinutes: 15 * 60,
        minLevel: null,
        maxLevel: null,
        genderTeams: 'ANY',
      },
      now,
    ),
    false,
  );
}

{
  const intent = base({ minLevel: 2, maxLevel: 3, userLevel: 2.5 });
  const gameStart = new Date('2026-07-28T18:00:00Z');
  assert.equal(
    intentMatchesGame(
      intent,
      {
        entityType: 'BAR',
        dateKey: '2026-07-28',
        clubId: null,
        startTime: gameStart,
        startTimeMinutes: 18 * 60,
        minLevel: 5,
        maxLevel: 7,
        genderTeams: 'ANY',
      },
      new Date('2026-07-28T12:00:00Z'),
    ),
    true,
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
    intentWindowIsReachable(
      { ...intent, timeOfDays: ['MORNING', 'EVENING'] },
      timezone,
      new Date('2026-07-28T13:00:00Z'),
    ),
    true,
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

// --- intentMismatch: explains the first failing dimension for a far pair ---

{
  // Compatible pair -> no mismatch.
  const a = base();
  assert.equal(intentMismatch(a, base()), null);
}

{
  // No shared day.
  const a = base({ dateKeys: ['2026-07-28'] });
  const b = base({ dateKeys: ['2026-07-30'] });
  assert.deepEqual(intentMismatch(a, b), { reason: 'dates' });
}

{
  // Clubs both set, no overlap.
  const a = base({ clubIds: ['c1'] });
  const b = base({ clubIds: ['c2'] });
  assert.deepEqual(intentMismatch(a, b), { reason: 'clubs' });
}

{
  // Time windows don't overlap — other plays evenings.
  const a = base({ timeOfDay: 'MORNING' });
  const b = base({ timeOfDay: 'EVENING' });
  assert.deepEqual(intentMismatch(a, b), { reason: 'time', period: 'EVENING' });
}

{
  // Multi-period timeOfDays on the other side — first concrete period wins.
  const a = base({ timeOfDay: 'MORNING' });
  const b = base({ timeOfDays: ['AFTERNOON', 'EVENING'], timeOfDay: 'ANYTIME' });
  assert.deepEqual(intentMismatch(a, b), { reason: 'time', period: 'AFTERNOON' });
}

{
  const a = base({ timeOfDay: 'EVENING' });
  const b = base({ timeOfDay: 'CUSTOM', startTime: '11:00', endTime: '13:00' });
  assert.deepEqual(intentMismatch(a, b), {
    reason: 'time',
    period: 'CUSTOM',
    startTime: '11:00',
    endTime: '13:00',
  });
}

{
  const a = base({ timeOfDay: 'EVENING' });
  const b = base({
    timeOfDay: 'MORNING',
    timeOfDays: ['MORNING', 'CUSTOM'],
    startTime: '11:00',
    endTime: '13:00',
  });
  assert.deepEqual(intentMismatch(a, b), {
    reason: 'time',
    period: 'CUSTOM',
    startTime: '11:00',
    endTime: '13:00',
  });
}

{
  // Level out of band.
  const a = base({ userLevel: 2, minLevel: null, maxLevel: 3 });
  const b = base({ userLevel: 7, minLevel: null, maxLevel: null });
  assert.deepEqual(intentMismatch(a, b), { reason: 'level' });
}

{
  // Gender preference conflict.
  const a = base({ genderTeams: 'MEN', userGender: 'MALE' });
  const b = base({ genderTeams: 'WOMEN', userGender: 'FEMALE' });
  assert.deepEqual(intentMismatch(a, b), { reason: 'gender' });
}

{
  // First failing dimension wins (dates short-circuits before clubs).
  const a = base({ dateKeys: ['2026-07-28'], clubIds: ['c1'] });
  const b = base({ dateKeys: ['2026-07-30'], clubIds: ['c2'] });
  assert.deepEqual(intentMismatch(a, b), { reason: 'dates' });
}

// --- intentFitBreakdown: full per-dimension pass/fail report ---

{
  const ALL_OK = [
    { dimension: 'dates', ok: true },
    { dimension: 'clubs', ok: true },
    { dimension: 'time', ok: true, period: 'ANYTIME' },
    { dimension: 'level', ok: true },
    { dimension: 'gender', ok: true },
  ];

  // Fully compatible pair -> every dimension ok.
  assert.deepEqual(intentFitBreakdown(base(), base()), ALL_OK);
}

{
  // Order is always dates, clubs, time, level, gender.
  const result = intentFitBreakdown(base(), base());
  assert.deepEqual(
    result.map((c) => c.dimension),
    ['dates', 'clubs', 'time', 'level', 'gender'],
  );
}

{
  // Dates fail (no shared day), everything else ok.
  const a = base({ dateKeys: ['2026-07-28'] });
  const b = base({ dateKeys: ['2026-07-30'] });
  assert.deepEqual(intentFitBreakdown(a, b), [
    { dimension: 'dates', ok: false },
    { dimension: 'clubs', ok: true },
    { dimension: 'time', ok: true, period: 'ANYTIME' },
    { dimension: 'level', ok: true },
    { dimension: 'gender', ok: true },
  ]);
}

{
  // Clubs both pinned, no overlap -> only clubs fails.
  const a = base({ clubIds: ['c1'] });
  const b = base({ clubIds: ['c2'] });
  assert.deepEqual(intentFitBreakdown(a, b), [
    { dimension: 'dates', ok: true },
    { dimension: 'clubs', ok: false },
    { dimension: 'time', ok: true, period: 'ANYTIME' },
    { dimension: 'level', ok: true },
    { dimension: 'gender', ok: true },
  ]);
}

{
  // Time windows don't overlap (other plays evenings) -> time fails with period.
  const a = base({ timeOfDay: 'MORNING' });
  const b = base({ timeOfDay: 'EVENING' });
  assert.deepEqual(intentFitBreakdown(a, b), [
    { dimension: 'dates', ok: true },
    { dimension: 'clubs', ok: true },
    { dimension: 'time', ok: false, period: 'EVENING' },
    { dimension: 'level', ok: true },
    { dimension: 'gender', ok: true },
  ]);
}

{
  // Multi-period on the other side — first concrete period is reported.
  const a = base({ timeOfDay: 'MORNING' });
  const b = base({ timeOfDays: ['AFTERNOON', 'EVENING'], timeOfDay: 'ANYTIME' });
  const result = intentFitBreakdown(a, b);
  assert.equal(result[2].dimension, 'time');
  assert.equal(result[2].ok, false);
  assert.equal(result[2].period, 'AFTERNOON');
}

{
  const a = base({ timeOfDay: 'EVENING' });
  const b = base({ timeOfDay: 'CUSTOM', startTime: '11:00', endTime: '13:00' });
  assert.deepEqual(intentFitBreakdown(a, b)[2], {
    dimension: 'time',
    ok: false,
    period: 'CUSTOM',
    startTime: '11:00',
    endTime: '13:00',
  });
}

{
  const a = base({ timeOfDay: 'CUSTOM', startTime: '10:00', endTime: '14:00' });
  const b = base({ timeOfDay: 'CUSTOM', startTime: '11:00', endTime: '13:00' });
  assert.deepEqual(intentFitBreakdown(a, b)[2], {
    dimension: 'time',
    ok: true,
    period: 'CUSTOM',
    startTime: '11:00',
    endTime: '13:00',
  });
}

{
  // Level out of band (b too strong for a's cap) -> only level fails.
  const a = base({ userLevel: 2, minLevel: null, maxLevel: 3 });
  const b = base({ userLevel: 7, minLevel: null, maxLevel: null });
  assert.deepEqual(intentFitBreakdown(a, b), [
    { dimension: 'dates', ok: true },
    { dimension: 'clubs', ok: true },
    { dimension: 'time', ok: true, period: 'ANYTIME' },
    { dimension: 'level', ok: false },
    { dimension: 'gender', ok: true },
  ]);
}

{
  // Gender conflict -> only gender fails.
  const a = base({ genderTeams: 'MEN', userGender: 'MALE' });
  const b = base({ genderTeams: 'WOMEN', userGender: 'FEMALE' });
  assert.deepEqual(intentFitBreakdown(a, b), [
    { dimension: 'dates', ok: true },
    { dimension: 'clubs', ok: true },
    { dimension: 'time', ok: true, period: 'ANYTIME' },
    { dimension: 'level', ok: true },
    { dimension: 'gender', ok: false },
  ]);
}

{
  // Multiple failures reported simultaneously (unlike intentMismatch).
  const a = base({ dateKeys: ['2026-07-28'], clubIds: ['c1'], timeOfDay: 'MORNING' });
  const b = base({ dateKeys: ['2026-07-30'], clubIds: ['c2'], timeOfDay: 'EVENING' });
  assert.deepEqual(intentFitBreakdown(a, b), [
    { dimension: 'dates', ok: false },
    { dimension: 'clubs', ok: false },
    { dimension: 'time', ok: false, period: 'EVENING' },
    { dimension: 'level', ok: true },
    { dimension: 'gender', ok: true },
  ]);
}

console.log('playIntentCriteria.test.ts: ok');
