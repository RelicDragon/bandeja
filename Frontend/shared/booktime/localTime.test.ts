import { describe, expect, it } from 'vitest';
import {
  booktimeIsoToUtcIso,
  isBooktimeNaiveLocalIso,
} from './localTime';

describe('booktime localTime', () => {
  it('detects naive booktime ISO strings', () => {
    expect(isBooktimeNaiveLocalIso('2026-06-14T09:00')).toBe(true);
    expect(isBooktimeNaiveLocalIso('2026-06-14T09:00:00.000Z')).toBe(false);
  });

  it('converts fake-Z Belgrade wall clock to UTC', () => {
    expect(booktimeIsoToUtcIso('2026-06-14T09:00:00.000Z', 'Europe/Belgrade')).toBe(
      '2026-06-14T07:00:00.000Z',
    );
  });

  it('converts naive Belgrade summer time to UTC', () => {
    expect(booktimeIsoToUtcIso('2026-06-14T09:00', 'Europe/Belgrade')).toBe(
      '2026-06-14T07:00:00.000Z',
    );
  });
});
