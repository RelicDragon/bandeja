import { describe, expect, it } from 'vitest';
import { format, parse, startOfDay } from 'date-fns';
import type { Game } from '@/types';
import { filterGamesForCalendarDay, unionDateRangeWithDay } from './calendarSelectedDayFilter';

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

  it('round-trips selected day through store-style yyyy-MM-dd key', () => {
    const clicked = parse('2026-04-30', 'yyyy-MM-dd', new Date());
    const stored = format(startOfDay(clicked), 'yyyy-MM-dd');
    const restored = parse(stored, 'yyyy-MM-dd', new Date());
    const games = [gameOn('2026-04-30')];
    expect(filterGamesForCalendarDay(games, startOfDay(restored))).toHaveLength(1);
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
