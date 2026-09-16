import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  APP_UI_LANGUAGES,
  APP_UI_FALLBACK_LANGUAGE,
  APP_UI_LANGUAGE_META,
  GAME_TEXT_TRANSLATION_POLICY_VERSION,
  GAME_TEXT_LOCALIZATION_GENERATION_ENABLED,
  isAppUiLanguage,
  normalizeAppUiLanguage,
} = require('../dist/index.js');

const __dirname = dirname(fileURLToPath(import.meta.url));

const EXPECTED = ['en', 'ru', 'sr', 'es', 'cs', 'ar', 'zh', 'id', 'hi', 'th', 'ja'];

test('APP_UI_LANGUAGES matches the 11 product UI languages', () => {
  assert.deepEqual([...APP_UI_LANGUAGES], EXPECTED);
  assert.equal(APP_UI_FALLBACK_LANGUAGE, 'en');
  assert.equal(GAME_TEXT_TRANSLATION_POLICY_VERSION, 1);
  assert.equal(GAME_TEXT_LOCALIZATION_GENERATION_ENABLED, true);
});

test('Serbian Latin and Chinese Simplified are explicit in meta', () => {
  assert.match(APP_UI_LANGUAGE_META.sr.notes, /Latin/i);
  assert.equal(APP_UI_LANGUAGE_META.sr.script, 'Latn');
  assert.match(APP_UI_LANGUAGE_META.zh.notes, /Simplified/i);
  assert.equal(APP_UI_LANGUAGE_META.zh.script, 'Hans');
});

test('normalizeAppUiLanguage falls back for unsupported codes', () => {
  assert.equal(normalizeAppUiLanguage('sr-Latn'), 'sr');
  assert.equal(normalizeAppUiLanguage('zh-Hans'), 'zh');
  assert.equal(normalizeAppUiLanguage('fr'), 'en');
  assert.equal(normalizeAppUiLanguage(null), 'en');
  assert.equal(isAppUiLanguage('ja'), true);
  assert.equal(isAppUiLanguage('ko'), false);
});

test('parity with Frontend/src/i18n/config.ts APP_UI_LANGUAGES', () => {
  const configPath = join(__dirname, '../../../Frontend/src/i18n/config.ts');
  const src = readFileSync(configPath, 'utf8');
  assert.match(
    src,
    /from ['"]@bandeja\/app-locale['"]/,
    'config.ts must import the shared app-locale registry',
  );
  assert.match(src, /export \{[^}]*APP_UI_LANGUAGES[^}]*\}/, 'config.ts must re-export APP_UI_LANGUAGES');
  assert.deepEqual([...APP_UI_LANGUAGES], EXPECTED);
});
