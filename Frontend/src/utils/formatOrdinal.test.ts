/**
 * PRD 359 — the ordinal in "In queue · 2nd".
 */
import { describe, expect, it } from 'vitest';
import {
  formatLocaleNumber,
  formatOrdinal,
  hasOrdinalSuffixes,
  ordinalBaseLocale,
  ordinalLabel,
} from './formatOrdinal';

describe('formatOrdinal', () => {
  it('builds English ordinals, teens exception included', () => {
    expect(formatOrdinal(1, 'en')).toBe('1st');
    expect(formatOrdinal(2, 'en')).toBe('2nd');
    expect(formatOrdinal(3, 'en')).toBe('3rd');
    expect(formatOrdinal(4, 'en')).toBe('4th');
    // The whole reason this goes through `Intl.PluralRules` rather than
    // `n % 10`: 11–13 are "th" while 21 is "st".
    expect(formatOrdinal(11, 'en')).toBe('11th');
    expect(formatOrdinal(12, 'en')).toBe('12th');
    expect(formatOrdinal(13, 'en')).toBe('13th');
    expect(formatOrdinal(21, 'en')).toBe('21st');
  });

  it('uses the regional base tag', () => {
    expect(ordinalBaseLocale('en-GB')).toBe('en');
    expect(formatOrdinal(2, 'en-GB')).toBe('2nd');
    expect(formatOrdinal(2, 'EN')).toBe('2nd');
  });

  it('writes the Spanish ordinal indicator and the Czech full stop', () => {
    expect(formatOrdinal(2, 'es')).toBe('2.º');
    expect(formatOrdinal(2, 'cs')).toBe('2.');
  });

  it('refuses to guess for locales with no derivable suffix', () => {
    for (const locale of ['ru', 'sr', 'zh', 'ja', 'th', 'ar', 'hi', 'id']) {
      expect(formatOrdinal(2, locale)).toBeNull();
      expect(hasOrdinalSuffixes(locale)).toBe(false);
    }
    expect(formatOrdinal(2, undefined)).toBeNull();
    expect(formatOrdinal(2, '')).toBeNull();
  });

  it('rejects values that are not a real position', () => {
    expect(formatOrdinal(Number.NaN, 'en')).toBeNull();
    expect(formatOrdinal(Number.POSITIVE_INFINITY, 'en')).toBeNull();
  });

  it('formats the digits in the locale numbering system', () => {
    expect(formatLocaleNumber(2, 'en')).toBe('2');
    // Whatever the platform's CLDR says for the tag — `ar` defaults to Latin
    // digits, `ar-EG` to Arabic-Indic — never a hand-rolled digit map.
    expect(formatLocaleNumber(2, 'ar')).toBe(new Intl.NumberFormat('ar').format(2));
    expect(formatLocaleNumber(2, 'ar-EG')).toBe(new Intl.NumberFormat('ar').format(2));
    expect(formatLocaleNumber(1234, 'en')).toBe('1,234');
  });

  it('survives a nonsense locale tag instead of throwing at render time', () => {
    expect(formatLocaleNumber(2, 'not a tag')).toBe('2');
    expect(formatOrdinal(2, 'not a tag')).toBeNull();
  });
});

describe('ordinalLabel', () => {
  it('prefers the derived suffix and never calls the fallback', () => {
    let called = 0;
    const label = ordinalLabel(2, 'en', (position) => {
      called += 1;
      return `No. ${position}`;
    });
    expect(label).toBe('2nd');
    expect(called).toBe(0);
  });

  it('hands the locale-formatted digits to the fallback', () => {
    expect(ordinalLabel(2, 'ja', (position) => `${position}番目`)).toBe('2番目');
    expect(ordinalLabel(2, 'ru', (position) => `${position}-й`)).toBe('2-й');
    expect(ordinalLabel(2, 'ar', (position) => `رقم ${position}`)).toBe(
      `رقم ${new Intl.NumberFormat('ar').format(2)}`,
    );
  });
});
