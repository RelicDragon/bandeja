/**
 * `User.language` defaults to `"auto"`, which `Intl` rejects. These cases pin
 * the behaviour that keeps a notification builder from throwing.
 */
import assert from 'node:assert/strict';
import { DEFAULT_INTL_LOCALE, resolveIntlLocale } from './intlLocale';

// The whole point: the schema default must not reach `Intl`.
assert.equal(resolveIntlLocale('auto'), DEFAULT_INTL_LOCALE);
assert.equal(resolveIntlLocale('AUTO'), DEFAULT_INTL_LOCALE);
assert.equal(resolveIntlLocale('system'), DEFAULT_INTL_LOCALE);
assert.equal(resolveIntlLocale('default'), DEFAULT_INTL_LOCALE);

// Absent values behave the same way.
assert.equal(resolveIntlLocale(null), DEFAULT_INTL_LOCALE);
assert.equal(resolveIntlLocale(undefined), DEFAULT_INTL_LOCALE);
assert.equal(resolveIntlLocale(''), DEFAULT_INTL_LOCALE);
assert.equal(resolveIntlLocale('   '), DEFAULT_INTL_LOCALE);

// Serbian is Latin in this product; the bare tag resolves to Cyrillic.
assert.equal(resolveIntlLocale('sr'), 'sr-Latn');
assert.equal(resolveIntlLocale('SR'), 'sr-Latn');

// Every other app language passes through untouched.
for (const lang of ['en', 'ru', 'es', 'cs', 'ar', 'zh', 'id', 'hi', 'th', 'ja']) {
  assert.equal(resolveIntlLocale(lang), lang, `${lang} is handed through`);
}

// Malformed tags fall back instead of throwing.
assert.equal(resolveIntlLocale('not a locale'), DEFAULT_INTL_LOCALE);
assert.equal(resolveIntlLocale('!!'), DEFAULT_INTL_LOCALE);

// Whatever comes back must actually construct a formatter.
for (const input of ['auto', 'sr', 'en', 'zz', 'not a locale', null]) {
  const locale = resolveIntlLocale(input);
  assert.doesNotThrow(
    () => new Intl.DateTimeFormat(locale, { timeZone: 'UTC', month: 'short' }).format(new Date()),
    `resolveIntlLocale(${String(input)}) must be usable by Intl`,
  );
}

console.log('intlLocale.test.ts: all assertions passed');
