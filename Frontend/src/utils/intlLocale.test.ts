import { describe, expect, it } from 'vitest';
import { resolveIntlLocale } from './intlLocale';

/** Cyrillic block — the script a Serbian-Latin UI must never show. */
const CYRILLIC = /[Ѐ-ӿ]/;

describe('resolveIntlLocale', () => {
  it('adds the Latin script tag to Serbian', () => {
    expect(resolveIntlLocale('sr')).toBe('sr-Latn');
    expect(resolveIntlLocale('sr-RS')).toBe('sr-Latn-RS');
  });

  it('keeps an explicit script', () => {
    expect(resolveIntlLocale('sr-Cyrl')).toBe('sr-Cyrl');
    expect(resolveIntlLocale('sr-Latn-RS')).toBe('sr-Latn-RS');
  });

  it('leaves every other locale untouched', () => {
    for (const locale of ['en', 'ru', 'es', 'cs', 'ar', 'zh', 'id', 'hi', 'th', 'ja']) {
      expect(resolveIntlLocale(locale)).toBe(locale);
    }
  });

  it('falls back to English for an empty tag', () => {
    expect(resolveIntlLocale('')).toBe('en');
    expect(resolveIntlLocale('   ')).toBe('en');
    expect(resolveIntlLocale(null)).toBe('en');
    expect(resolveIntlLocale(undefined)).toBe('en');
  });

  it('produces Latin month names and relative times for sr', () => {
    const september = new Date(Date.UTC(2026, 8, 1));

    expect(
      new Intl.DateTimeFormat(resolveIntlLocale('sr'), {
        month: 'long',
        timeZone: 'UTC',
      }).format(september),
    ).not.toMatch(CYRILLIC);

    expect(
      new Intl.RelativeTimeFormat(resolveIntlLocale('sr'), { numeric: 'auto' }).format(
        -5,
        'minute',
      ),
    ).not.toMatch(CYRILLIC);

    // The bare tag is exactly the bug this util exists to prevent.
    expect(
      new Intl.DateTimeFormat('sr', { month: 'long', timeZone: 'UTC' }).format(september),
    ).toMatch(CYRILLIC);
  });
});
