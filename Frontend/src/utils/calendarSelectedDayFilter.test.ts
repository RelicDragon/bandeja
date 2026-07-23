import { describe, expect, it } from 'vitest';
import { format, parse, startOfDay } from 'date-fns';
import type { Game } from '@/types';
import {
  filterGamesForCalendarDay,
  gameCalendarDayKey,
  selectedDayInMonth,
  unionDateRangeWithDay,
} from './calendarSelectedDayFilter';

const dayKey = (d: Date) => format(startOfDay(d), 'yyyy-MM-dd');

const gameOn = (dateStr: string, id = 'g1'): Game =>
  ({
    id,
    startTime: `${dateStr}T15:00:00.000Z`,
    timeIsSet: true,
    entityType: 'GAME',
    status: 'ANNOUNCED',
    participants: [],
    maxParticipants: 4,
    isPublic: true,
  }) as Game;

describe('selectedDayInMonth', () => {
  it('preserves day-of-month when paging to another month', () => {
    const anchor = parse('2026-07-17', 'yyyy-MM-dd', new Date());
    const may = parse('2026-05-01', 'yyyy-MM-dd', new Date());
    expect(format(selectedDayInMonth(anchor, may), 'yyyy-MM-dd')).toBe('2026-05-17');
  });

  it('clamps to last day when target month is shorter', () => {
    const anchor = parse('2026-03-31', 'yyyy-MM-dd', new Date());
    const feb = parse('2026-02-01', 'yyyy-MM-dd', new Date());
    expect(format(selectedDayInMonth(anchor, feb), 'yyyy-MM-dd')).toBe('2026-02-28');
  });
});

describe('filterGamesForCalendarDay', () => {
  it('returns games matching the selected calendar day key', () => {
    const selected = parse('2026-05-31', 'yyyy-MM-dd', new Date());
    const games = [gameOn('2026-05-30'), gameOn('2026-05-31', 'g2')];
    const result = filterGamesForCalendarDay(games, selected);
    expect(result.map((g) => g.id)).toEqual(['g2']);
  });

  it('matches overflow-month days using the same key as MonthCalendar cells', () => {
    const overflowDay = parse('2026-06-04', 'yyyy-MM-dd', new Date());
    const cellKey = dayKey(overflowDay);
    const games = [gameOn('2026-06-04')];
    expect(filterGamesForCalendarDay(games, overflowDay)[0]?.id).toBe('g1');
    expect(cellKey).toBe('2026-06-04');
  });

  it('buckets early-UTC games onto the city calendar day (not device TZ)', () => {
    // 04:00 UTC = 06:00 Belgrade on Jul 23; would be Jul 22 evening in US timezones.
    const selected = parse('2026-07-23', 'yyyy-MM-dd', new Date());
    const games = [
      {
        id: 'early',
        startTime: '2026-07-23T04:00:00.000Z',
        timeIsSet: true,
        entityType: 'GAME',
        status: 'ANNOUNCED',
        participants: [],
        maxParticipants: 4,
        isPublic: true,
      } as Game,
    ];
    expect(filterGamesForCalendarDay(games, selected, 'Europe/Belgrade')).toHaveLength(1);
    expect(gameCalendarDayKey(games[0], 'Europe/Belgrade')).toBe('2026-07-23');
  });
});

describe('unionDateRangeWithDay', () => {
  it('extends range start when selected day is before visible grid', () => {
    const start = parse('2026-05-26', 'yyyy-MM-dd', new Date());
    const end = parse('2026-07-06', 'yyyy-MM-dd', new Date());
    const selected = parse('2026-05-15', 'yyyy-MM-dd', new Date());
    const merged = unionDateRangeWithDay(start, end, selected);
    expect(format(merged.startDate, 'yyyy-MM-dd')).toBe('2026-05-15');
    expect(format(merged.endDate, 'yyyy-MM-dd')).toBe('2026-07-06');
  });

  it('extends range end when selected day is after visible grid', () => {
    const start = parse('2026-04-28', 'yyyy-MM-dd', new Date());
    const end = parse('2026-06-01', 'yyyy-MM-dd', new Date());
    const selected = parse('2026-06-11', 'yyyy-MM-dd', new Date());
    const merged = unionDateRangeWithDay(start, end, selected);
    expect(format(merged.startDate, 'yyyy-MM-dd')).toBe('2026-04-28');
    expect(format(merged.endDate, 'yyyy-MM-dd')).toBe('2026-06-11');
  });
});
