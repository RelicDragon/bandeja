import { describe, expect, it } from 'vitest';
import {
  buildRecapCalendar,
  buildRecapSparklinePath,
  recapRingDash,
} from './recapFormat';

describe('buildRecapCalendar', () => {
  it('pads the first week with the server-supplied Monday-based offset', () => {
    const cells = buildRecapCalendar({ daysInMonth: 30, weekdayOffset: 1, playedDays: [1] });
    expect(cells[0]).toEqual({ day: null, played: false });
    expect(cells[1]).toEqual({ day: 1, played: true });
  });

  it('always produces whole weeks', () => {
    for (const daysInMonth of [28, 29, 30, 31]) {
      for (let weekdayOffset = 0; weekdayOffset < 7; weekdayOffset += 1) {
        const cells = buildRecapCalendar({ daysInMonth, weekdayOffset, playedDays: [] });
        expect(cells.length % 7).toBe(0);
        expect(cells.filter((cell) => cell.day != null)).toHaveLength(daysInMonth);
      }
    }
  });

  it('glows exactly the played days', () => {
    const cells = buildRecapCalendar({ daysInMonth: 30, weekdayOffset: 0, playedDays: [2, 9, 30] });
    const played = cells.filter((cell) => cell.played).map((cell) => cell.day);
    expect(played).toEqual([2, 9, 30]);
  });

  it('normalises an out-of-range offset instead of producing a ragged grid', () => {
    const cells = buildRecapCalendar({ daysInMonth: 30, weekdayOffset: 8, playedDays: [] });
    expect(cells.length % 7).toBe(0);
    expect(cells[0]).toEqual({ day: null, played: false });
    expect(cells[1]).toEqual({ day: 1, played: false });
  });
});

describe('buildRecapSparklinePath', () => {
  it('draws a flat month through the middle rather than collapsing it', () => {
    expect(buildRecapSparklinePath([4, 4, 4], 100, 50)).toBe('M0.00 25.00 L50.00 25.00 L100.00 25.00');
  });

  it('puts a higher level higher on screen', () => {
    const path = buildRecapSparklinePath([3.9, 4.1], 100, 50);
    expect(path).toBe('M0.00 50.00 L100.00 0.00');
  });

  it('still draws something for a single point', () => {
    expect(buildRecapSparklinePath([4], 100, 50)).toBe('M0 25 L100 25');
  });

  it('returns nothing when there is nothing to draw', () => {
    expect(buildRecapSparklinePath([], 100, 50)).toBe('');
  });
});

describe('recapRingDash', () => {
  it('fills the whole circle at 100%', () => {
    const { dash, gap } = recapRingDash(100, 10);
    expect(dash).toBeCloseTo(2 * Math.PI * 10, 5);
    expect(gap).toBeCloseTo(0, 5);
  });

  it('clamps nonsense input instead of drawing outside the ring', () => {
    expect(recapRingDash(-10, 10).dash).toBe(0);
    expect(recapRingDash(400, 10).gap).toBeCloseTo(0, 5);
  });
});
