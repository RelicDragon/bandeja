import { describe, expect, it } from 'vitest';
import { formatOpeningHour, relativeUpdatedPhrase } from './clubTodayStripFormat';

describe('relativeUpdatedPhrase', () => {
  const now = Date.parse('2026-09-20T12:00:00.000Z');

  it('returns null without a usable timestamp', () => {
    expect(relativeUpdatedPhrase(null, 'en', now)).toBeNull();
    expect(relativeUpdatedPhrase('not-a-date', 'en', now)).toBeNull();
  });

  it('returns an empty string under a minute', () => {
    expect(relativeUpdatedPhrase('2026-09-20T11:59:40.000Z', 'en', now)).toBe('');
  });

  it('uses Serbian Latin, not Cyrillic', () => {
    const phrase = relativeUpdatedPhrase('2026-09-20T11:55:00.000Z', 'sr', now);
    expect(phrase).not.toMatch(/[Ѐ-ӿ]/);
  });
});

describe('formatOpeningHour', () => {
  it('honours the viewer 12-hour preference instead of a baked :00', () => {
    expect(formatOpeningHour(7, 'en-US', true)).toMatch(/7:00\s?(AM|am)/i);
    expect(formatOpeningHour(22, 'en-US', true)).toMatch(/10:00\s?(PM|pm)/i);
  });

  it('renders a 24-hour clock when that is the preference', () => {
    expect(formatOpeningHour(22, 'en-GB', false)).toBe('22:00');
  });

  it('treats hour 24 as midnight and clamps nonsense', () => {
    expect(formatOpeningHour(24, 'en-GB', false)).toBe('00:00');
    expect(formatOpeningHour(-3, 'en-GB', false)).toBe('00:00');
  });

  it('never leaks a bare hour number into the copy', () => {
    // The old shape was "{{open}}:00" baked into all 11 translations; whatever
    // the locale, this must come back a formatted clock time.
    for (const locale of ['en', 'ru', 'sr', 'ar', 'ja', 'hi']) {
      const formatted = formatOpeningHour(7, locale, false);
      expect(formatted).not.toBe('7');
      expect(formatted.length).toBeGreaterThan(2);
    }
  });
});
