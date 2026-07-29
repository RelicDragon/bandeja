import assert from 'node:assert/strict';
import {
  affinityScore,
  buildRematchKey,
  intentMatchesGame,
  intentsCompatible,
  resolveTimeWindow,
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

{
  const a = base({ timeOfDay: 'CUSTOM', startTime: '17:00', endTime: '20:00' });
  const b = base({ timeOfDay: 'CUSTOM', startTime: '19:00', endTime: '22:00' });
  const compat = intentsCompatible(a, b);
  assert.equal(compat.ok, true);
  assert.deepEqual(compat.timeWindow, { startMinutes: 19 * 60, endMinutes: 20 * 60 });
}

{
  const a = base({ timeOfDay: 'CUSTOM', startTime: '10:00', endTime: '12:00' });
  const b = base({ timeOfDay: 'CUSTOM', startTime: '13:00', endTime: '15:00' });
  assert.equal(intentsCompatible(a, b).ok, false);
}

{
  const w = resolveTimeWindow({ timeOfDay: 'EVENING', startTime: null, endTime: null });
  assert.ok(w);
  assert.equal(w!.startMinutes, 18 * 60);
}

{
  const intent = base({ minLevel: 3, maxLevel: 4 });
  const now = new Date('2026-07-28T10:00:00Z');
  const gameStart = new Date('2026-07-28T18:00:00Z');
  assert.equal(
    intentMatchesGame(
      intent,
      {
        dateKey: '2026-07-28',
        clubId: 'c1',
        startTime: gameStart,
        startTimeMinutes: 18 * 60,
        minLevel: 2,
        maxLevel: 5,
        genderTeams: null,
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
        clubId: 'c1',
        startTime: gameStart,
        startTimeMinutes: 18 * 60,
        minLevel: 5,
        maxLevel: 7,
        genderTeams: null,
      },
      now,
    ),
    false,
  );
}

{
  const k1 = buildRematchKey(['u2', 'u1', 'u3']);
  const k2 = buildRematchKey(['u3', 'u1', 'u2']);
  assert.equal(k1, k2);
  assert.equal(k1, 'u1|u2|u3');
  assert.notEqual(k1, buildRematchKey(['u1', 'u2']));
}

{
  const seed = base({ clubIds: ['c1'], timeOfDay: 'EVENING', userLevel: 3.5 });
  const near = base({ clubIds: ['c1'], timeOfDay: 'EVENING', userLevel: 3.5 });
  const far = base({ clubIds: ['c2'], timeOfDay: 'MORNING', userLevel: 6 });
  assert.ok(affinityScore(seed, near).score > affinityScore(seed, far).score);
}

console.log('playIntentLifecycle.test.ts: ok');
