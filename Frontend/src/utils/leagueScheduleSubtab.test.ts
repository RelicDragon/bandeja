import { describe, it, expect } from 'vitest';
import {
  resolveLeagueScheduleMode,
  repairLeagueScheduleSearchIfInvalid,
  canonicalScheduleQuery,
  inferRoundTypeFromScheduleSearch,
  roundTypeFromScheduleSubtab,
  scheduleSubtabForSeasonSwitch,
  scheduleSubtabForViewSwitch,
} from './leagueScheduleSubtab';

describe('resolveLeagueScheduleMode', () => {
  it('defaults to bracket when playoff exists and subtab is missing', () => {
    expect(resolveLeagueScheduleMode(null, true, true, true)).toBe('bracket');
    expect(resolveLeagueScheduleMode('', false, false, true)).toBe('bracket');
    expect(resolveLeagueScheduleMode(null, true, true, true, false)).toBe('bracket');
  });

  it('defaults to my then list when no playoff', () => {
    expect(resolveLeagueScheduleMode(null, true, true, false)).toBe('my');
    expect(resolveLeagueScheduleMode(null, false, true, false)).toBe('list');
  });

  it('honors explicit my subtab even when bracket playoff exists', () => {
    expect(resolveLeagueScheduleMode('my', true, true, true)).toBe('my');
  });

  it('maps regular and playoff season markers to my then list', () => {
    expect(resolveLeagueScheduleMode('regular', true, true, true)).toBe('my');
    expect(resolveLeagueScheduleMode('regular', false, true, true)).toBe('list');
    expect(resolveLeagueScheduleMode('playoff', true, true, true)).toBe('my');
    expect(resolveLeagueScheduleMode('playoff', false, true, true)).toBe('list');
  });

  it('keeps explicit list and table when playoff exists', () => {
    expect(resolveLeagueScheduleMode('list', true, true, true)).toBe('list');
    expect(resolveLeagueScheduleMode('table', true, true, true)).toBe('table');
  });

  it('falls back from leftover bracket when takeover is off', () => {
    expect(resolveLeagueScheduleMode('bracket', true, true, true, false)).toBe('my');
    expect(resolveLeagueScheduleMode('bracket', false, false, true, false)).toBe('list');
  });

  it('falls back from bracket when no playoff exists', () => {
    expect(resolveLeagueScheduleMode('bracket', true, false, false)).toBe('my');
    expect(resolveLeagueScheduleMode('bracket', false, false, false)).toBe('list');
  });
});

describe('repairLeagueScheduleSearchIfInvalid', () => {
  it('adds subtab=bracket when schedule tab has no subtab and bracket playoff exists', () => {
    expect(repairLeagueScheduleSearchIfInvalid('?tab=schedule', true, true, true)).toBe(
      'tab=schedule&subtab=bracket'
    );
    expect(repairLeagueScheduleSearchIfInvalid('?tab=schedule', true, true, true, false)).toBe(
      'tab=schedule&subtab=bracket'
    );
  });

  it('leaves missing subtab alone when no bracket playoff', () => {
    expect(repairLeagueScheduleSearchIfInvalid('?tab=schedule', true, true, false)).toBeNull();
  });

  it('keeps explicit regular, playoff, list, and my', () => {
    expect(repairLeagueScheduleSearchIfInvalid('?tab=schedule&subtab=regular', true, true, true)).toBeNull();
    expect(repairLeagueScheduleSearchIfInvalid('?tab=schedule&subtab=playoff', true, true, true)).toBeNull();
    expect(repairLeagueScheduleSearchIfInvalid('?tab=schedule&subtab=list', true, true, true)).toBeNull();
    expect(repairLeagueScheduleSearchIfInvalid('?tab=schedule&subtab=my', true, true, true)).toBeNull();
  });

  it('rewrites leftover bracket to regular when takeover is off', () => {
    const next = repairLeagueScheduleSearchIfInvalid('?tab=schedule&subtab=bracket', true, true, true, false);
    expect(next).toBe('tab=schedule&subtab=regular');
  });

  it('rewrites invalid table on regular-with-playoff to regular', () => {
    const next = repairLeagueScheduleSearchIfInvalid('?tab=schedule&subtab=table', false, false, true, false);
    expect(next).toBe('tab=schedule&subtab=regular');
  });

  it('ignores non-schedule tabs', () => {
    expect(repairLeagueScheduleSearchIfInvalid('?tab=general', true, true, true)).toBeNull();
  });
});

describe('canonicalScheduleQuery', () => {
  it('omits subtab for my mode when my tab is visible and no playoff', () => {
    expect(canonicalScheduleQuery('?foo=1', 'my', true)).toBe('foo=1&tab=schedule');
  });

  it('keeps subtab=my when playoff exists so empty can still mean auto bracket', () => {
    expect(canonicalScheduleQuery('?tab=schedule', 'my', true, true)).toBe('tab=schedule&subtab=my');
  });

  it('sets season markers and bracket explicitly', () => {
    expect(canonicalScheduleQuery('?tab=schedule', 'regular', true, true)).toBe('tab=schedule&subtab=regular');
    expect(canonicalScheduleQuery('?tab=schedule', 'playoff', true, true)).toBe('tab=schedule&subtab=playoff');
    expect(canonicalScheduleQuery('?tab=schedule', 'bracket', true)).toBe('tab=schedule&subtab=bracket');
  });
});

describe('inferRoundTypeFromScheduleSearch', () => {
  it('maps season markers and table', () => {
    expect(inferRoundTypeFromScheduleSearch('?tab=schedule&subtab=bracket', true)).toBe('PLAYOFF');
    expect(inferRoundTypeFromScheduleSearch('?tab=schedule&subtab=playoff', true)).toBe('PLAYOFF');
    expect(inferRoundTypeFromScheduleSearch('?tab=schedule&subtab=regular', true)).toBe('REGULAR');
    expect(inferRoundTypeFromScheduleSearch('?tab=schedule&subtab=table', true)).toBe('REGULAR');
  });

  it('does not infer season from explicit my or list', () => {
    expect(inferRoundTypeFromScheduleSearch('?tab=schedule&subtab=my', true)).toBeNull();
    expect(inferRoundTypeFromScheduleSearch('?tab=schedule&subtab=list', true)).toBeNull();
  });

  it('defaults missing subtab to playoff when playoff rounds exist', () => {
    expect(inferRoundTypeFromScheduleSearch('?tab=schedule', true)).toBe('PLAYOFF');
    expect(inferRoundTypeFromScheduleSearch('?tab=schedule', false)).toBeNull();
  });
});

describe('roundTypeFromScheduleSubtab', () => {
  it('reads definitive season tags only', () => {
    expect(roundTypeFromScheduleSubtab('bracket')).toBe('PLAYOFF');
    expect(roundTypeFromScheduleSubtab('playoff')).toBe('PLAYOFF');
    expect(roundTypeFromScheduleSubtab('regular')).toBe('REGULAR');
    expect(roundTypeFromScheduleSubtab('table')).toBe('REGULAR');
    expect(roundTypeFromScheduleSubtab('my')).toBeNull();
    expect(roundTypeFromScheduleSubtab('list')).toBeNull();
    expect(roundTypeFromScheduleSubtab(null)).toBeNull();
  });
});

describe('scheduleSubtabForSeasonSwitch', () => {
  it('writes regular when leaving playoffs', () => {
    expect(scheduleSubtabForSeasonSwitch('REGULAR', true)).toBe('regular');
    expect(scheduleSubtabForSeasonSwitch('REGULAR', false)).toBe('regular');
  });

  it('writes bracket or playoff when entering playoffs', () => {
    expect(scheduleSubtabForSeasonSwitch('PLAYOFF', true)).toBe('bracket');
    expect(scheduleSubtabForSeasonSwitch('PLAYOFF', false)).toBe('playoff');
  });
});

describe('scheduleSubtabForViewSwitch', () => {
  it('keeps playoff season when choosing My during playoffs', () => {
    expect(scheduleSubtabForViewSwitch('my', 'PLAYOFF', true)).toBe('playoff');
    expect(scheduleSubtabForViewSwitch('my', 'PLAYOFF', false)).toBe('playoff');
  });

  it('writes explicit my during regular when bracket playoff exists', () => {
    expect(scheduleSubtabForViewSwitch('my', 'REGULAR', true)).toBe('my');
  });

  it('passes through list/table/bracket', () => {
    expect(scheduleSubtabForViewSwitch('list', 'REGULAR', true)).toBe('list');
    expect(scheduleSubtabForViewSwitch('table', 'REGULAR', true)).toBe('table');
    expect(scheduleSubtabForViewSwitch('bracket', 'PLAYOFF', true)).toBe('bracket');
  });
});

describe('season + view switch flows', () => {
  it('playoffs → regular → my/list never snaps back to bracket', () => {
    const hasBracket = true;
    const afterLeave = scheduleSubtabForSeasonSwitch('REGULAR', hasBracket);
    expect(afterLeave).toBe('regular');
    expect(inferRoundTypeFromScheduleSearch(`?tab=schedule&subtab=${afterLeave}`, true)).toBe('REGULAR');
    expect(resolveLeagueScheduleMode(afterLeave, true, true, hasBracket, false)).toBe('my');
    expect(repairLeagueScheduleSearchIfInvalid(`?tab=schedule&subtab=${afterLeave}`, true, true, hasBracket, false)).toBeNull();

    const my = scheduleSubtabForViewSwitch('my', 'REGULAR', hasBracket);
    expect(my).toBe('my');
    expect(repairLeagueScheduleSearchIfInvalid(`?tab=schedule&subtab=${my}`, true, true, hasBracket, false)).toBeNull();
    expect(inferRoundTypeFromScheduleSearch(`?tab=schedule&subtab=${my}`, true)).toBeNull();

    const list = scheduleSubtabForViewSwitch('list', 'REGULAR', hasBracket);
    expect(list).toBe('list');
    expect(repairLeagueScheduleSearchIfInvalid(`?tab=schedule&subtab=${list}`, true, true, hasBracket, false)).toBeNull();
    expect(resolveLeagueScheduleMode(list, true, true, hasBracket, false)).toBe('list');
  });

  it('empty subtab with bracket playoff repairs to bracket', () => {
    const repaired = repairLeagueScheduleSearchIfInvalid('?tab=schedule', true, true, true, false);
    expect(repaired).toBe('tab=schedule&subtab=bracket');
    expect(inferRoundTypeFromScheduleSearch(`?${repaired}`, true)).toBe('PLAYOFF');
  });

  it('playoff My survives reload via subtab=playoff', () => {
    const subtab = scheduleSubtabForViewSwitch('my', 'PLAYOFF', true);
    expect(subtab).toBe('playoff');
    expect(inferRoundTypeFromScheduleSearch(`?tab=schedule&subtab=${subtab}`, true)).toBe('PLAYOFF');
    expect(resolveLeagueScheduleMode(subtab, true, true, true, true)).toBe('my');
  });

  it('session playoff season uses subtab=playoff', () => {
    const subtab = scheduleSubtabForSeasonSwitch('PLAYOFF', false);
    expect(subtab).toBe('playoff');
    expect(inferRoundTypeFromScheduleSearch(`?tab=schedule&subtab=${subtab}`, true)).toBe('PLAYOFF');
    expect(resolveLeagueScheduleMode(subtab, false, false, false, false)).toBe('list');
  });
});
