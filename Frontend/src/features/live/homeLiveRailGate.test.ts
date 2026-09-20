import { describe, expect, it } from 'vitest';
import { hasOwnGameToday, shouldShowHomeLiveRail } from './homeLiveRailGate';

const NOW = new Date('2026-09-20T21:30:00.000Z'); // 23:30 in Belgrade

describe('hasOwnGameToday', () => {
  it('is false for an empty schedule', () => {
    expect(hasOwnGameToday([], 'Europe/Belgrade', NOW)).toBe(false);
    expect(hasOwnGameToday(undefined, 'Europe/Belgrade', NOW)).toBe(false);
  });

  it('counts a game on the viewer city day', () => {
    expect(
      hasOwnGameToday(
        [{ startTime: '2026-09-20T17:00:00.000Z', status: 'ANNOUNCED' }],
        'Europe/Belgrade',
        NOW,
      ),
    ).toBe(true);
  });

  it('uses the city day, not the device day', () => {
    const games = [{ startTime: '2026-09-20T22:30:00.000Z', status: 'ANNOUNCED' }];
    // 00:30 on the 21st in Belgrade — tomorrow there, still the 20th in UTC.
    expect(hasOwnGameToday(games, 'Europe/Belgrade', NOW)).toBe(false);
    expect(hasOwnGameToday(games, 'UTC', NOW)).toBe(true);
  });

  it('ignores cancelled games and league season shells', () => {
    expect(
      hasOwnGameToday(
        [{ startTime: '2026-09-20T17:00:00.000Z', status: 'CANCELLED' }],
        'Europe/Belgrade',
        NOW,
      ),
    ).toBe(false);
    expect(
      hasOwnGameToday(
        [
          {
            startTime: '2026-09-20T17:00:00.000Z',
            status: 'ANNOUNCED',
            entityType: 'LEAGUE_SEASON',
          },
        ],
        'Europe/Belgrade',
        NOW,
      ),
    ).toBe(false);
  });

  it('survives an unparseable start time', () => {
    expect(hasOwnGameToday([{ startTime: 'nope' }], 'Europe/Belgrade', NOW)).toBe(false);
  });
});

describe('shouldShowHomeLiveRail', () => {
  it('is the inverse: Home offers the rail only on an empty day', () => {
    expect(shouldShowHomeLiveRail([], 'Europe/Belgrade', NOW)).toBe(true);
    expect(
      shouldShowHomeLiveRail(
        [{ startTime: '2026-09-20T17:00:00.000Z', status: 'ANNOUNCED' }],
        'Europe/Belgrade',
        NOW,
      ),
    ).toBe(false);
  });
});
