import { describe, expect, it } from 'vitest';
import { formatShortWeekday } from '@/utils/dateFormat';

describe('formatShortWeekday', () => {
  const monday = new Date(2024, 0, 1);

  it('uses 2-letter abbreviations for Russian', () => {
    expect(formatShortWeekday(monday, 'ru')).toBe('пн');
  });

  it('uses 3-letter abbreviations for English', () => {
    expect(formatShortWeekday(monday, 'en')).toBe('Mon');
  });

  it('uses 2-letter abbreviations for Czech', () => {
    expect(formatShortWeekday(monday, 'cs')).toBe('po');
  });
});
