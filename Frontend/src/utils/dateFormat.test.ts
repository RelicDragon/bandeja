import { describe, expect, it, vi } from 'vitest';
import { formatSearchResultDate, formatShortWeekday } from '@/utils/dateFormat';

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

describe('formatSearchResultDate', () => {
  const t = (key: string) =>
    ({ 'createGame.today': 'Today', 'createGame.yesterday': 'Yesterday', 'createGame.tomorrow': 'Tomorrow' })[key] ?? key;

  it('shows localized today/yesterday/tomorrow labels', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 5, 15, 12, 0, 0));
    expect(formatSearchResultDate(new Date(2024, 5, 15, 9, 0, 0), t)).toBe('Today');
    expect(formatSearchResultDate(new Date(2024, 5, 14, 9, 0, 0), t)).toBe('Yesterday');
    expect(formatSearchResultDate(new Date(2024, 5, 16, 9, 0, 0), t)).toBe('Tomorrow');
    vi.useRealTimers();
  });

  it('shows short weekday and short date for older dates in the current year', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 5, 15, 12, 0, 0));
    const label = formatSearchResultDate(new Date(2024, 3, 10, 9, 0, 0), t);
    expect(label).toMatch(/10/);
    expect(label).toMatch(/Apr/i);
    expect(label).not.toMatch(/2024/);
    expect(label).not.toMatch(/ago/i);
    vi.useRealTimers();
  });

  it('includes year when the date is not in the current year', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 5, 15, 12, 0, 0));
    const label = formatSearchResultDate(new Date(2023, 3, 10, 9, 0, 0), t);
    expect(label).toMatch(/2023/);
    vi.useRealTimers();
  });
});
