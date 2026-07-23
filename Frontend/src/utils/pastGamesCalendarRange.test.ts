import { describe, expect, it } from 'vitest';
import { parse } from 'date-fns';
import type { Game } from '@/types';
import {
  filterPastGamesForCalendarRange,
  pastGamesCacheCoversRange,
} from '@/utils/pastGamesCalendarRange';

function game(id: string, startTime: string): Game {
  return { id, startTime } as Game;
}

const d = (key: string) => parse(key, 'yyyy-MM-dd', new Date());

describe('pastGamesCalendarRange', () => {
  it('filters games inside the requested calendar range', () => {
    const games = [
      game('g1', '2026-05-10T10:00:00.000Z'),
      game('g2', '2026-05-20T10:00:00.000Z'),
      game('g3', '2026-06-01T10:00:00.000Z'),
    ];

    const filtered = filterPastGamesForCalendarRange(
      games,
      d('2026-05-01'),
      d('2026-05-31'),
      'UTC',
    );

    expect(filtered.map((g) => g.id)).toEqual(['g1', 'g2']);
  });

  it('keeps Belgrade early-morning games when device TZ would drop them', () => {
    // 02:00 UTC = 04:00 Belgrade on Jun 29.
    const games = [game('early', '2026-06-29T02:00:00.000Z')];
    const filtered = filterPastGamesForCalendarRange(
      games,
      d('2026-06-29'),
      d('2026-07-05'),
      'Europe/Belgrade',
    );
    expect(filtered.map((g) => g.id)).toEqual(['early']);
  });

  it('detects when cached past games span the visible range', () => {
    const games = [
      game('g1', '2026-05-01T10:00:00.000Z'),
      game('g2', '2026-05-31T10:00:00.000Z'),
    ];

    expect(
      pastGamesCacheCoversRange(games, d('2026-05-10'), d('2026-05-20'), 'UTC'),
    ).toBe(true);
    expect(
      pastGamesCacheCoversRange(games, d('2026-04-01'), d('2026-05-31'), 'UTC'),
    ).toBe(false);
  });
});
