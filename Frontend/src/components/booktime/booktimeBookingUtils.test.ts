import { describe, expect, it, vi, afterEach } from 'vitest';
import { formatBooktimeBookingDate, formatBooktimeBookingWhen } from './booktimeBookingUtils';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';

const TZ = 'Europe/Belgrade';
const DISPLAY = { locale: 'en-US', hour12: false } as const;

function bookingAt(storedUtc: string): BooktimeBookingRecord {
  return { uuid: 'b1', bookingStart: storedUtc, bookingEnd: storedUtc };
}

describe('formatBooktimeBookingDate', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses Today for the booking day in club timezone', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-16T12:00:00.000Z'));
    const label = formatBooktimeBookingDate(
      bookingAt('2026-06-16T07:00:00.000Z'),
      { timezone: TZ, displaySettings: DISPLAY },
    );
    expect(label).toBe('Today');
  });

  it('uses Tomorrow for the next calendar day in club timezone', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-16T12:00:00.000Z'));
    const label = formatBooktimeBookingDate(
      bookingAt('2026-06-17T07:00:00.000Z'),
      { timezone: TZ, displaySettings: DISPLAY },
    );
    expect(label).toBe('Tomorrow');
  });

  it('uses Yesterday for the previous calendar day in club timezone', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-16T12:00:00.000Z'));
    const label = formatBooktimeBookingDate(
      bookingAt('2026-06-15T07:00:00.000Z'),
      { timezone: TZ, displaySettings: DISPLAY },
    );
    expect(label).toBe('Yesterday');
  });

  it('uses localized weekday for other dates', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-16T12:00:00.000Z'));
    const label = formatBooktimeBookingDate(
      bookingAt('2026-06-19T07:00:00.000Z'),
      { timezone: TZ, displaySettings: DISPLAY },
    );
    expect(label).toMatch(/^Friday,/);
  });
});

describe('formatBooktimeBookingWhen', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('includes relative date label in when string', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-16T12:00:00.000Z'));
    const label = formatBooktimeBookingWhen(
      {
        uuid: 'b1',
        bookingStart: '2026-06-16T07:00:00.000Z',
        bookingEnd: '2026-06-16T09:00:00.000Z',
      },
      { timezone: TZ, displaySettings: DISPLAY },
    );
    expect(label).toBe('Today · 09:00 – 11:00');
  });
});
