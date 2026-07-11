import { describe, expect, it } from 'vitest';
import type { Game } from '@/types';
import {
  filterPastGamesForCalendarRange,
  pastGamesCacheCoversRange,
} from '@/utils/pastGamesCalendarRange';

function game(id: string, startTime: string): Game {
  return { id, startTime } as Game;
}

describe('pastGamesCalendarRange', () => {
  it('filters games inside the requested calendar range', () => {
    const games = [
      game('g1', '2026-05-10T10:00:00.000Z'),
      game('g2', '2026-05-20T10:00:00.000Z'),
      game('g3', '2026-06-01T10:00:00.000Z'),
    ];

    const filtered = filterPastGamesForCalendarRange(
      games,
      new Date('2026-05-01'),
      new Date('2026-05-31'),
    );

    expect(filtered.map((g) => g.id)).toEqual(['g1', 'g2']);
  });

  it('detects when cached past games span the visible range', () => {
    const games = [
      game('g1', '2026-05-01T10:00:00.000Z'),
      game('g2', '2026-05-31T10:00:00.000Z'),
    ];

    expect(
      pastGamesCacheCoversRange(games, new Date('2026-05-10'), new Date('2026-05-20')),
    ).toBe(true);
    expect(
      pastGamesCacheCoversRange(games, new Date('2026-04-01'), new Date('2026-05-31')),
    ).toBe(false);
  });
});
