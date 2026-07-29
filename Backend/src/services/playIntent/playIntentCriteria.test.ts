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
  assert.equal(
    intentMatchesGame(intent, {
      dateKey: '2026-07-28',
      clubId: 'club1',
      startTimeMinutes: 18 * 60,
      minLevel: 2.5,
      maxLevel: 4,
      genderTeams: 'ANY',
    }),
    true,
  );
  assert.equal(
    intentMatchesGame(intent, {
      dateKey: '2026-07-28',
      clubId: 'other',
      startTimeMinutes: 18 * 60,
      minLevel: 2.5,
      maxLevel: 4,
      genderTeams: 'ANY',
    }),
    false,
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
