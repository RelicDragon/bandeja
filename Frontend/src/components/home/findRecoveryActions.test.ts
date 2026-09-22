import { describe, expect, it } from 'vitest';
import {
  FIND_RECOVERY_CLEARED_FILTERS,
  createGameStartTimeForDay,
  hasClearableFindFilters,
  relateDayToToday,
  resolveFindRecoveryActions,
  resolveFindRecoveryCreateDay,
  type FindRecoveryFilters,
} from './findRecoveryActions';

/**
 * PRD 363 — the recovery resolver is pure: which day the create action
 * targets, and whether "Clear filters" has anything to clear.
 */

const DEFAULTS: FindRecoveryFilters = {
  gameFilter: false,
  trainingFilter: false,
  tournamentFilter: false,
  leaguesFilter: false,
  eventsFilter: false,
  filterClubIds: [],
  filterTimeStart: '00:00',
  filterTimeEnd: '24:00',
  filterLevelMin: 1.0,
  filterLevelMax: 7.0,
  filterAvailableSlots: false,
  filterSuitableRating: false,
  filterNoRating: false,
  hideBarGames: false,
  filterNoviceFriendly: false,
  filterSport: 'primary',
};

const TODAY = '2026-09-22';

describe('resolveFindRecoveryCreateDay', () => {
  it('calendar view targets the selected day', () => {
    expect(resolveFindRecoveryCreateDay({ view: 'calendar', selectedDay: '2026-09-24', todayKey: TODAY })).toBe(
      '2026-09-24',
    );
  });

  it('calendar view with no selection targets today', () => {
    expect(resolveFindRecoveryCreateDay({ view: 'calendar', selectedDay: null, todayKey: TODAY })).toBe(TODAY);
  });

  it('never offers a past day', () => {
    expect(resolveFindRecoveryCreateDay({ view: 'calendar', selectedDay: '2026-09-20', todayKey: TODAY })).toBe(
      TODAY,
    );
  });

  it('list view targets tomorrow, across a month end', () => {
    expect(resolveFindRecoveryCreateDay({ view: 'list', selectedDay: '2026-09-24', todayKey: TODAY })).toBe(
      '2026-09-23',
    );
    expect(resolveFindRecoveryCreateDay({ view: 'list', selectedDay: null, todayKey: '2026-09-30' })).toBe(
      '2026-10-01',
    );
  });

  it('a Weekend shortcut is just the selected Saturday', () => {
    expect(resolveFindRecoveryCreateDay({ view: 'calendar', selectedDay: '2026-09-26', todayKey: TODAY })).toBe(
      '2026-09-26',
    );
  });
});

describe('hasClearableFindFilters', () => {
  it('is false on defaults', () => {
    expect(hasClearableFindFilters(DEFAULTS)).toBe(false);
  });

  const cases: [string, Partial<FindRecoveryFilters>][] = [
    ['an entity chip', { tournamentFilter: true }],
    ['a club', { filterClubIds: ['club-1'] }],
    ['a time window start', { filterTimeStart: '18:00' }],
    ['a time window end', { filterTimeEnd: '22:00' }],
    ['a level minimum', { filterLevelMin: 2.5 }],
    ['a level maximum', { filterLevelMax: 5 }],
    ['available slots', { filterAvailableSlots: true }],
    ['suitable rating', { filterSuitableRating: true }],
    ['no rating', { filterNoRating: true }],
    ['hide bar games', { hideBarGames: true }],
    ['novices only', { filterNoviceFriendly: true }],
    ['a non-primary sport', { filterSport: 'TENNIS' }],
    ['all sports', { filterSport: 'all' }],
  ];

  for (const [label, patch] of cases) {
    it(`is true with ${label}`, () => {
      expect(hasClearableFindFilters({ ...DEFAULTS, ...patch })).toBe(true);
    });
  }

  it('ignores float noise on the level range', () => {
    expect(hasClearableFindFilters({ ...DEFAULTS, filterLevelMin: 1.0000000001, filterLevelMax: 6.9999999999 })).toBe(
      false,
    );
  });
});

describe('FIND_RECOVERY_CLEARED_FILTERS', () => {
  it('resets exactly the clearable keys and nothing else', () => {
    expect(Object.keys(FIND_RECOVERY_CLEARED_FILTERS).sort()).toEqual(Object.keys(DEFAULTS).sort());
    expect(FIND_RECOVERY_CLEARED_FILTERS).toEqual(DEFAULTS);
  });

  it('leaves day, view, panel state and the admin private toggle alone', () => {
    for (const key of ['activeTab', 'calendarSelectedDate', 'listViewStartDate', 'filtersPanelOpen', 'showPrivateGames']) {
      expect(key in FIND_RECOVERY_CLEARED_FILTERS).toBe(false);
    }
  });
});

describe('resolveFindRecoveryActions', () => {
  it('combines both answers', () => {
    expect(
      resolveFindRecoveryActions({
        view: 'list',
        selectedDay: null,
        todayKey: TODAY,
        filters: { ...DEFAULTS, hideBarGames: true },
      }),
    ).toEqual({ createDay: '2026-09-23', canClearFilters: true });
  });
});

describe('relateDayToToday', () => {
  it('names today and tomorrow, everything else is a date', () => {
    expect(relateDayToToday(TODAY, TODAY)).toBe('today');
    expect(relateDayToToday('2026-09-23', TODAY)).toBe('tomorrow');
    expect(relateDayToToday('2026-09-24', TODAY)).toBe('other');
    expect(relateDayToToday('2026-10-01', '2026-09-30')).toBe('tomorrow');
  });
});

describe('createGameStartTimeForDay', () => {
  it('is local noon of that day, like the calendar prefill', () => {
    const iso = createGameStartTimeForDay('2026-09-24');
    const date = new Date(iso);
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(8);
    expect(date.getDate()).toBe(24);
    expect(date.getHours()).toBe(12);
    expect(date.getMinutes()).toBe(0);
  });
});
