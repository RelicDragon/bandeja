import { describe, it, expect } from 'vitest';
import {
  resolveLeagueScheduleMode,
  repairLeagueScheduleSearchIfInvalid,
  canonicalScheduleQuery,
} from './leagueScheduleSubtab';

describe('resolveLeagueScheduleMode', () => {
  it('defaults to bracket when playoff exists and subtab is missing', () => {
    expect(resolveLeagueScheduleMode(null, true, true, true)).toBe('bracket');
    expect(resolveLeagueScheduleMode('', false, false, true)).toBe('bracket');
  });

  it('defaults to my then list when no playoff', () => {
    expect(resolveLeagueScheduleMode(null, true, true, false)).toBe('my');
    expect(resolveLeagueScheduleMode(null, false, true, false)).toBe('list');
  });

  it('honors explicit my subtab even when bracket playoff exists', () => {
    expect(resolveLeagueScheduleMode('my', true, true, true)).toBe('my');
  });

  it('coerces list to bracket when bracket playoff exists', () => {
    expect(resolveLeagueScheduleMode('list', false, false, true)).toBe('bracket');
  });

  it('falls back from bracket when no playoff exists', () => {
    expect(resolveLeagueScheduleMode('bracket', true, false, false)).toBe('my');
    expect(resolveLeagueScheduleMode('bracket', false, false, false)).toBe('list');
  });
});

describe('repairLeagueScheduleSearchIfInvalid', () => {
  it('adds subtab=bracket when schedule tab has no subtab and bracket playoff exists', () => {
    const next = repairLeagueScheduleSearchIfInvalid('?tab=schedule', true, true, true);
    expect(next).toBe('tab=schedule&subtab=bracket');
  });

  it('leaves missing subtab alone when no bracket playoff', () => {
    expect(repairLeagueScheduleSearchIfInvalid('?tab=schedule', true, true, false)).toBeNull();
  });

  it('rewrites list to bracket when bracket playoff exists', () => {
    const next = repairLeagueScheduleSearchIfInvalid('?tab=schedule&subtab=list', false, false, true);
    expect(next).toBe('tab=schedule&subtab=bracket');
  });

  it('ignores non-schedule tabs', () => {
    expect(repairLeagueScheduleSearchIfInvalid('?tab=general', true, true, true)).toBeNull();
  });
});

describe('canonicalScheduleQuery', () => {
  it('omits subtab for my mode when my tab is visible', () => {
    expect(canonicalScheduleQuery('?foo=1', 'my', true)).toBe('foo=1&tab=schedule');
  });

  it('sets subtab=bracket explicitly', () => {
    expect(canonicalScheduleQuery('?tab=schedule', 'bracket', true)).toBe('tab=schedule&subtab=bracket');
  });
});
