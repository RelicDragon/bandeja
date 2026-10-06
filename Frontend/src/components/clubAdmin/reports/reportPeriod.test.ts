import { describe, expect, it } from 'vitest';
import { CLUB_REPORT_MAX_DAYS } from '@shared/clubAdmin/contract';
import { daysBetweenInclusive } from '@shared/clubAdmin/clubTime';
import { clampRange, metricDelta, presetRange, previousRange, resolvePeriod } from './reportPeriod';

const TODAY = '2026-10-07';

describe('presetRange', () => {
  it('ends today and includes it', () => {
    expect(presetRange('7', TODAY)).toEqual({ from: '2026-10-01', to: TODAY });
    expect(daysBetweenInclusive(presetRange('30', TODAY).from, TODAY)).toBe(30);
    expect(presetRange('90', '2026-03-01')).toEqual({ from: '2025-12-02', to: '2026-03-01' });
  });
});

describe('clampRange', () => {
  it('swaps reversed ends', () => {
    expect(clampRange('2026-10-07', '2026-10-01')).toEqual({ from: '2026-10-01', to: '2026-10-07' });
  });

  it('trims the start to the max length, keeping the end', () => {
    const r = clampRange('2020-01-01', '2026-10-07');
    expect(r?.to).toBe('2026-10-07');
    expect(daysBetweenInclusive(r!.from, r!.to)).toBe(CLUB_REPORT_MAX_DAYS);
  });

  it('rejects invalid dates', () => {
    expect(clampRange('2026-13-01', '2026-10-07')).toBeNull();
    expect(clampRange('', '2026-10-07')).toBeNull();
  });
});

describe('previousRange', () => {
  it('is the same length immediately before', () => {
    expect(previousRange({ from: '2026-10-01', to: '2026-10-07' })).toEqual({ from: '2026-09-24', to: '2026-09-30' });
    expect(previousRange({ from: '2026-03-01', to: '2026-03-01' })).toEqual({ from: '2026-02-28', to: '2026-02-28' });
  });
});

describe('resolvePeriod', () => {
  it('defaults to the last 30 days without compare', () => {
    expect(resolvePeriod(new URLSearchParams(''), TODAY)).toEqual({
      from: '2026-09-08',
      to: TODAY,
      mode: '30',
      compare: false,
    });
  });

  it('reads a preset and compare', () => {
    expect(resolvePeriod(new URLSearchParams('period=7&compare=1'), TODAY)).toMatchObject({ from: '2026-10-01', mode: '7', compare: true });
  });

  it('reads a custom range and falls back when it is broken', () => {
    expect(resolvePeriod(new URLSearchParams('period=custom&from=2026-05-01&to=2026-05-31'), TODAY)).toMatchObject({
      from: '2026-05-01',
      to: '2026-05-31',
      mode: 'custom',
    });
    expect(resolvePeriod(new URLSearchParams('period=custom&from=x'), TODAY).mode).toBe('30');
  });
});

describe('metricDelta', () => {
  it('computes diff, percent and direction', () => {
    expect(metricDelta(12, 10)).toEqual({ diff: 2, pct: 20, direction: 'up' });
    expect(metricDelta(5, 10)).toEqual({ diff: -5, pct: -50, direction: 'down' });
    expect(metricDelta(3, 3)?.direction).toBe('flat');
  });

  it('has no percentage against zero and no delta without both values', () => {
    expect(metricDelta(4, 0)).toEqual({ diff: 4, pct: null, direction: 'up' });
    expect(metricDelta(4, null)).toBeNull();
    expect(metricDelta(null, 3)).toBeNull();
  });
});
