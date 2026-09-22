import { describe, expect, it } from 'vitest';
import {
  LOOKING_COUNT_MIN_VISIBLE,
  resolveLookingCountDisplay,
  resolveLookingCountWindow,
} from './lookingCount';

/** PRD 363 — the count shows only at three or more, only with the flag on. */

describe('resolveLookingCountDisplay', () => {
  it('hides everything while the flag is off, whatever the number', () => {
    expect(resolveLookingCountDisplay({ enabled: false, count: 12, dayKeys: ['2026-09-22'] })).toBeNull();
  });

  it('hides a server null (flag off server-side) and an unloaded value', () => {
    expect(resolveLookingCountDisplay({ enabled: true, count: null })).toBeNull();
    expect(resolveLookingCountDisplay({ enabled: true, count: undefined })).toBeNull();
  });

  it('hides below the threshold and shows from it on', () => {
    expect(LOOKING_COUNT_MIN_VISIBLE).toBe(3);
    expect(resolveLookingCountDisplay({ enabled: true, count: 0 })).toBeNull();
    expect(resolveLookingCountDisplay({ enabled: true, count: 2 })).toBeNull();
    expect(resolveLookingCountDisplay({ enabled: true, count: 3, dayKeys: ['2026-09-22'] })).toEqual({
      count: 3,
      window: 'today',
    });
  });

  it('names the two-day window after 18:00 city time', () => {
    expect(
      resolveLookingCountDisplay({ enabled: true, count: 5, dayKeys: ['2026-09-22', '2026-09-23'] }),
    ).toEqual({ count: 5, window: 'todayAndTomorrow' });
  });

  it('treats a malformed count as nothing to show', () => {
    expect(resolveLookingCountDisplay({ enabled: true, count: Number.NaN })).toBeNull();
  });
});

describe('resolveLookingCountWindow', () => {
  it('defaults to today', () => {
    expect(resolveLookingCountWindow(undefined)).toBe('today');
    expect(resolveLookingCountWindow([])).toBe('today');
    expect(resolveLookingCountWindow(['a'])).toBe('today');
    expect(resolveLookingCountWindow(['a', 'b'])).toBe('todayAndTomorrow');
  });
});
