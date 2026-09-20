import assert from 'node:assert/strict';
import {
  RECAP_IMAGE_LANGUAGES,
  isRecapRtlLanguage,
  recapCopy,
  resolveRecapImageLanguage,
} from './recapCopy';
import { RECAP_PUSH_LANGUAGES, buildMonthlyRecapPushPayload } from './recapPushCopy';
import { recapMonthLabel } from './recapSlideImage.renderer';

// --- language resolution ---------------------------------------------------

assert.equal(resolveRecapImageLanguage('ru'), 'ru');
assert.equal(resolveRecapImageLanguage('zh-Hans'), 'zh', 'a region tag falls back to the base');
assert.equal(resolveRecapImageLanguage('PT'), 'en', 'an unsupported language falls back to English');
assert.equal(resolveRecapImageLanguage(null), 'en');
assert.equal(resolveRecapImageLanguage(undefined), 'en');

assert.equal(isRecapRtlLanguage('ar'), true);
assert.equal(isRecapRtlLanguage('en'), false);

// --- the copy tables cover every app language ------------------------------

assert.deepEqual(
  [...RECAP_PUSH_LANGUAGES].sort(),
  [...RECAP_IMAGE_LANGUAGES].sort(),
  'the push copy table and the image copy table must cover the same 11 languages',
);

for (const language of RECAP_IMAGE_LANGUAGES) {
  for (const key of ['games', 'wins', 'level', 'partner', 'club', 'outro'] as const) {
    const value = recapCopy(language, key);
    assert.ok(value.trim().length > 0, `${language}.${key} is empty`);
  }
}

const english = RECAP_IMAGE_LANGUAGES.filter(
  (language) => language !== 'en' && recapCopy(language, 'wins') === recapCopy('en', 'wins'),
);
assert.deepEqual(english, [], 'no locale may ship the English string as its translation');

// --- month names never come from a hard-coded table -----------------------

assert.equal(recapMonthLabel('2026-09-01T00:00:00.000Z', 'en'), 'September 2026');
assert.notEqual(
  recapMonthLabel('2026-09-01T00:00:00.000Z', 'ru'),
  recapMonthLabel('2026-09-01T00:00:00.000Z', 'en'),
  'the month label is produced by Intl per locale',
);

// --- push payload ----------------------------------------------------------

const payload = buildMonthlyRecapPushPayload({
  monthKey: '2026-09',
  monthStart: '2026-09-01T00:00:00.000Z',
  language: 'en',
});
assert.equal(payload.type, 'MONTHLY_RECAP_READY');
assert.equal(payload.title, 'Your September recap is ready ✨');
assert.equal(payload.data?.recapMonthKey, '2026-09');
assert.ok(!payload.title.includes('{{month}}'), 'the month placeholder is interpolated');

const russian = buildMonthlyRecapPushPayload({
  monthKey: '2026-09',
  monthStart: '2026-09-01T00:00:00.000Z',
  language: 'ru',
});
assert.notEqual(russian.title, payload.title);
assert.ok(!russian.title.includes('{{month}}'));

const unknownLanguage = buildMonthlyRecapPushPayload({
  monthKey: '2026-09',
  monthStart: '2026-09-01T00:00:00.000Z',
  language: 'pt-BR',
});
assert.equal(unknownLanguage.title, payload.title, 'an unsupported language falls back to English');

console.log('✅ recapCopy tests passed');
