import { describe, expect, it } from 'vitest';
import {
  booktimeApiWallClockToUtcIso,
  booktimeBookingStartMs,
  booktimeIngestToStoredUtcIso,
  booktimeIsoToUtcIso,
  booktimeWireFormatToStoredUtcIso,
  isBooktimeNaiveLocalIso,
} from './localTime';

const TZ = 'Europe/Belgrade';

describe('booktime localTime', () => {
  it('detects naive booktime ISO strings', () => {
    expect(isBooktimeNaiveLocalIso('2026-06-14T09:00')).toBe(true);
    expect(isBooktimeNaiveLocalIso('2026-06-14T09:00:00.000Z')).toBe(false);
  });

  it('converts fake-Z Belgrade wall clock to UTC via wire seam', () => {
    expect(booktimeWireFormatToStoredUtcIso('2026-06-14T09:00:00.000Z', TZ)).toBe(
      '2026-06-14T07:00:00.000Z',
    );
    expect(booktimeApiWallClockToUtcIso('2026-06-14T09:00:00.000Z', TZ)).toBe(
      '2026-06-14T07:00:00.000Z',
    );
  });

  it('converts naive Belgrade summer time to UTC', () => {
    expect(booktimeIsoToUtcIso('2026-06-14T09:00', TZ)).toBe('2026-06-14T07:00:00.000Z');
    expect(booktimeIngestToStoredUtcIso('2026-06-14T09:00', TZ)).toBe('2026-06-14T07:00:00.000Z');
  });

  it('passes through stored UTC ISO strings', () => {
    expect(booktimeIsoToUtcIso('2026-06-14T07:00:00.000Z', TZ)).toBe('2026-06-14T07:00:00.000Z');
    expect(booktimeIngestToStoredUtcIso('2026-06-14T07:00:00.000Z', TZ)).toBe(
      '2026-06-14T07:00:00.000Z',
    );
  });

  it('converts fake-Z via booktimeIsoToUtcIso and ingest seam', () => {
    expect(booktimeIsoToUtcIso('2026-06-14T09:00:00.000Z', TZ)).toBe('2026-06-14T07:00:00.000Z');
    expect(booktimeIngestToStoredUtcIso('2026-06-14T09:00:00.000Z', TZ)).toBe(
      '2026-06-14T07:00:00.000Z',
    );
  });

  it('handles DST spring-forward via wire seam', () => {
    expect(booktimeIngestToStoredUtcIso('2026-03-29T10:00:00.000Z', TZ)).toBe(
      '2026-03-29T08:00:00.000Z',
    );
  });

  it('handles DST fall-back via wire seam', () => {
    expect(booktimeIngestToStoredUtcIso('2026-10-25T10:00:00.000Z', TZ)).toBe(
      '2026-10-25T09:00:00.000Z',
    );
  });

  it('uses normalized UTC for booktimeBookingStartMs on fake-Z', () => {
    expect(booktimeBookingStartMs('2026-06-14T09:00:00.000Z', TZ)).toBe(
      Date.parse('2026-06-14T07:00:00.000Z'),
    );
  });
});
