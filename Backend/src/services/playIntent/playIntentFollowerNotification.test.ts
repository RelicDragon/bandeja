import assert from 'node:assert/strict';
import { PlayIntentTimeOfDay, Sport } from '@prisma/client';
import { buildPlayIntentFollowerNotification } from './playIntentFollowerNotification';

const base = {
  creatorFirstName: 'Ana',
  sport: Sport.PADEL,
  cityName: 'Belgrade',
  timezone: 'Europe/Belgrade',
  dateKeys: ['2026-07-29', '2026-07-30'],
  timeOfDay: PlayIntentTimeOfDay.EVENING,
  startTime: null,
  endTime: null,
};

assert.deepEqual(
  buildPlayIntentFollowerNotification(base, 'en', new Date('2026-07-29T12:00:00Z')),
  {
    title: 'Ana wants to play',
    body: 'Padel · Today, Tomorrow · Evening · Belgrade. Tap to join.',
  },
);

assert.deepEqual(
  buildPlayIntentFollowerNotification(
    {
      ...base,
      creatorFirstName: null,
      dateKeys: ['2026-07-31'],
      timeOfDay: PlayIntentTimeOfDay.CUSTOM,
      startTime: '18:00',
      endTime: '20:00',
    },
    'ru',
    new Date('2026-07-29T12:00:00Z'),
  ),
  {
    title: 'Ваш друг хочет поиграть',
    body: 'Падел · Послезавтра · 18:00–20:00 · Belgrade. Нажмите, чтобы присоединиться.',
  },
);

for (const language of ['sr', 'es', 'cs']) {
  const localized = buildPlayIntentFollowerNotification(
    base,
    language,
    new Date('2026-07-29T12:00:00Z'),
  );
  assert.notEqual(localized.title, 'Ana wants to play');
  assert.ok(!localized.title.includes('{{'));
  assert.ok(!localized.body.includes('{{'));
  assert.ok(localized.body.includes('Belgrade'));
}

console.log('playIntentFollowerNotification.test.ts: ok');
