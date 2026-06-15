import { describe, expect, it } from 'vitest';
import {
  booktimeApiWallClockToUtcIso,
  booktimeBookingStartMs,
  booktimeIngestToStoredUtcIso,
  booktimeIsoToUtcIso,
  booktimeWireFormatToStoredUtcIso,
  isAlreadyStoredUtcIso,
  isBooktimeFakeUtcIso,
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
    expect(booktimeIsoToUtcIso('2026-06-15T16:00:00.000Z', TZ)).toBe('2026-06-15T16:00:00.000Z');
    expect(booktimeIngestToStoredUtcIso('2026-06-14T07:00:00.000Z', TZ)).toBe(
      '2026-06-14T07:00:00.000Z',
    );
  });

  it('converts fake-Z via ingest seam only (not booktimeIsoToUtcIso)', () => {
    expect(booktimeIsoToUtcIso('2026-06-14T09:00:00.000Z', TZ)).toBe('2026-06-14T09:00:00.000Z');
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

  it('uses normalized UTC for booktimeBookingStartMs after ingest', () => {
    const stored = booktimeIngestToStoredUtcIso('2026-06-14T09:00:00.000Z', TZ)!;
    expect(booktimeBookingStartMs(stored, TZ)).toBe(Date.parse('2026-06-14T07:00:00.000Z'));
  });

  it('is idempotent for morning stored UTC on wire ingest (misuse guard)', () => {
    const stored = '2026-06-19T07:00:00.000Z';
    expect(booktimeIngestToStoredUtcIso(stored, TZ)).toBe(stored);
    expect(booktimeIngestToStoredUtcIso(stored, TZ)).toBe(stored);
    expect(isAlreadyStoredUtcIso(stored, TZ)).toBe(true);
  });

  it('passes afternoon stored UTC through booktimeIsoToUtcIso (not wire ingest)', () => {
    const stored = booktimeIngestToStoredUtcIso('2026-06-15T18:00:00.000Z', TZ)!;
    expect(stored).toBe('2026-06-15T16:00:00.000Z');
    expect(booktimeIsoToUtcIso(stored, TZ)).toBe(stored);
    expect(booktimeIsoToUtcIso(stored, TZ)).toBe(stored);
  });

  it('documents afternoon wire re-ingest footgun — use booktimeIsoToUtcIso instead', () => {
    const stored = '2026-06-15T16:00:00.000Z';
    expect(isBooktimeFakeUtcIso(stored, TZ)).toBe(true);
    expect(booktimeIngestToStoredUtcIso(stored, TZ)).toBe('2026-06-15T14:00:00.000Z');
    expect(booktimeIngestToStoredUtcIso(booktimeIngestToStoredUtcIso(stored, TZ)!, TZ)).toBe(
      '2026-06-15T12:00:00.000Z',
    );
  });
});
