import assert from 'node:assert/strict';
import { buildPlayIntentDiscussionName } from './playIntentDiscussionName';

{
  const name = buildPlayIntentDiscussionName({
    timezone: 'UTC',
    dateKeys: ['2026-08-17'],
    timeOfDay: 'MORNING',
    startTime: null,
    endTime: null,
    clubNames: ['KSC'],
    lang: 'en',
    now: new Date('2026-08-10T12:00:00.000Z'),
  });
  assert.equal(name, 'Discussion for 2026-08-17 · Morning · KSC');
}

{
  const name = buildPlayIntentDiscussionName({
    timezone: 'UTC',
    dateKeys: ['2026-08-17'],
    timeOfDay: 'MORNING',
    startTime: null,
    endTime: null,
    clubNames: ['KSC', 'Padel Arena'],
    lang: 'en',
    now: new Date('2026-08-17T12:00:00.000Z'),
  });
  assert.equal(name, 'Discussion for Today · Morning · KSC / Padel Arena');
}

{
  const name = buildPlayIntentDiscussionName({
    timezone: 'UTC',
    dateKeys: ['2026-08-17'],
    timeOfDay: 'CUSTOM',
    startTime: '11:00',
    endTime: '13:00',
    clubNames: [],
    lang: 'en',
    now: new Date('2026-08-10T12:00:00.000Z'),
  });
  assert.equal(name, 'Discussion for 2026-08-17 · 11:00–13:00');
}

{
  const name = buildPlayIntentDiscussionName({
    timezone: 'UTC',
    dateKeys: ['2026-08-17'],
    timeOfDay: 'EVENING',
    startTime: null,
    endTime: null,
    clubNames: ['A'.repeat(120)],
    lang: 'en',
    now: new Date('2026-08-10T12:00:00.000Z'),
  });
  assert.equal(name.length, 100);
}

console.log('playIntentDiscussionName.test.ts: ok');
