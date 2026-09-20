/**
 * PRD 357 — the notification wiring around the weather alert.
 *
 * Three things a regression would quietly break:
 *   1. `GAME_WEATHER_ALERT` must map to `SEND_WEATHER_ALERTS`, or muting weather
 *      alerts in preferences would silence (or fail to silence) the wrong thing.
 *   2. The `weather` push action token must only ever carry `keep`.
 *   3. Organizer and participant copy must genuinely differ, and no template may
 *      hard-code `%`, `km/h` or an hour format.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { NotificationType, PreferenceKey } from '../../types/notifications.types';
import {
  PUSH_INVITE_ACTION_ALLOWED_ACTIONS,
  signPushInviteActionToken,
  verifyPushInviteActionToken,
} from '../push/pushInviteActionToken.service';
import { createGameWeatherAlertPushNotification } from '../push/notifications/game-weather-alert-push.notification';
import {
  formatClockTime,
  formatPercent,
  formatWindSpeed,
  weatherT,
  WEATHER_COPY_LANGUAGES,
} from './weatherAlertCopy';

// --- 1. preference mapping --------------------------------------------------

// Read as source rather than imported: `notificationPreference.service.ts`
// pulls in the Prisma client, and this suite must stay runnable without a
// database. The record it declares is total, so the compiler already proves the
// key exists — what this asserts is that it points at the *right* preference.
const prefSource = readFileSync(
  path.join(__dirname, '..', 'notificationPreference.service.ts'),
  'utf8',
);
assert.equal(
  prefSource.includes(
    `[NotificationType.${NotificationType.GAME_WEATHER_ALERT}]: PreferenceKey.SEND_WEATHER_ALERTS`,
  ),
  true,
  'GAME_WEATHER_ALERT must map to SEND_WEATHER_ALERTS',
);
assert.equal(
  new RegExp(`${PreferenceKey.SEND_WEATHER_ALERTS}:\\s*true`).test(prefSource),
  true,
  'weather alerts are on by default',
);

// --- 2. push action token ---------------------------------------------------

assert.deepEqual([...PUSH_INVITE_ACTION_ALLOWED_ACTIONS.weather], ['keep']);

{
  const scope = {
    userId: 'user_weather_1',
    kind: 'weather' as const,
    targetId: 'game_weather_1',
    action: 'keep' as const,
  };
  const token = signPushInviteActionToken(scope);
  assert.deepEqual(verifyPushInviteActionToken(token), scope);
}

{
  // A `weather` token must never be able to accept or decline anything —
  // otherwise it would fall into the controller's accept/decline ternary.
  let refused = false;
  try {
    signPushInviteActionToken({
      userId: 'user_weather_1',
      kind: 'weather',
      targetId: 'game_weather_1',
      action: 'accept',
    });
  } catch {
    refused = true;
  }
  assert.equal(refused, true, 'signing a weather/accept token must be refused');
}

// --- 3. copy ----------------------------------------------------------------

const alertInput = {
  gameId: 'game_weather_1',
  entityType: 'GAME',
  severity: 'likely' as const,
  pop: 70,
  windKph: 12,
  at: '2026-09-21T17:00:00.000Z',
  timeZone: 'UTC',
  place: 'Padel Centar · Court 3 (outdoor)',
  escalated: false,
  windDriven: false,
};

const organizer = createGameWeatherAlertPushNotification(alertInput, {
  id: 'user_weather_1',
  language: 'en',
  role: 'organizer',
});
const participant = createGameWeatherAlertPushNotification(alertInput, {
  id: 'user_weather_2',
  language: 'en',
  role: 'participant',
});

assert.equal(organizer.type, NotificationType.GAME_WEATHER_ALERT);
assert.notEqual(
  organizer.body,
  participant.body,
  'organizer and participant copy must differ',
);
assert.deepEqual(
  organizer.actions?.map((action) => action.id),
  ['moveIndoor', 'keep'],
  'organizers get the two fixing actions',
);
assert.deepEqual(
  participant.actions?.map((action) => action.id),
  ['forecast'],
  'participants only get the forecast',
);
assert.equal(typeof organizer.data?.weatherKeepActionToken, 'string');
assert.equal(
  participant.data?.weatherKeepActionToken,
  undefined,
  'a participant is never handed a keep-as-planned token',
);
assert.equal(
  organizer.data?.weatherDeepLink,
  '/games/game_weather_1?section=weather&action=moveIndoor',
);
assert.equal(participant.data?.weatherDeepLink, '/games/game_weather_1?section=weather');

{
  const escalated = createGameWeatherAlertPushNotification(
    { ...alertInput, escalated: true, severity: 'heavy', pop: 90 },
    { id: 'user_weather_1', language: 'en', role: 'organizer' },
  );
  assert.notEqual(escalated.title, organizer.title, 'the 2 h alert says the forecast got worse');
}

{
  const windy = createGameWeatherAlertPushNotification(
    { ...alertInput, windDriven: true, windKph: 48, pop: 10 },
    { id: 'user_weather_2', language: 'en', role: 'participant' },
  );
  assert.equal(windy.body.includes('48'), true, 'the wind alert leads with the wind speed');
}

// Every supported bot language resolves, and none falls back to a raw key.
for (const language of WEATHER_COPY_LANGUAGES) {
  const title = weatherT('weather.alertTitleRain', language);
  assert.notEqual(title, 'weather.alertTitleRain', `${language} must translate the title`);
}
assert.equal(
  weatherT('weather.alertTitleRain', 'klingon'),
  weatherT('weather.alertTitleRain', 'en'),
  'an unknown language falls back to English',
);

// --- Intl, not hard-coded units --------------------------------------------

assert.equal(formatPercent(70, 'en').includes('70'), true);
assert.equal(formatWindSpeed(42, 'en').includes('42'), true);
assert.notEqual(
  formatPercent(70, 'ar'),
  formatPercent(70, 'en'),
  'Arabic renders percentages differently — the value must go through Intl',
);
assert.equal(formatClockTime('not-a-date', 'en'), '');
assert.equal(formatClockTime('2026-09-21T17:00:00.000Z', 'en', 'UTC').includes('17') ||
  formatClockTime('2026-09-21T17:00:00.000Z', 'en', 'UTC').includes('5'), true);

{
  // No body template in any of the 11 locales may carry a literal unit.
  const copy = readFileSync(path.join(__dirname, 'weatherAlertCopy.ts'), 'utf8');
  const templates = copy.split('\n').filter((line) => line.includes("'weather.alertBody"));
  assert.equal(templates.length > 0, true, 'the body templates must exist');
  for (const line of templates) {
    assert.equal(line.includes('%'), false, `a body template hard-codes a percent sign: ${line}`);
    assert.equal(line.includes('km/h'), false, `a body template hard-codes km/h: ${line}`);
  }
}

console.log('weatherNotification.test.ts: ok');
