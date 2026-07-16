import { describe, expect, it } from 'vitest';
import type { Game } from '@/types';
import { sortGamesByStartTimeAsc, sortGamesByStatusAndStartTime } from './sortGames';

function g(id: string, startTime: string, status?: string): Game {
  return { id, startTime, status } as Game;
}

describe('sortGamesByStartTimeAsc', () => {
  it('orders earlier start times first', () => {
    const sorted = sortGamesByStartTimeAsc([
      g('late', '2026-07-17T20:00:00.000Z'),
      g('early', '2026-07-17T19:00:00.000Z'),
    ]);
    expect(sorted.map((x) => x.id)).toEqual(['early', 'late']);
  });
});

describe('sortGamesByStatusAndStartTime', () => {
  it('keeps active games earliest-first (19:00 before 20:00)', () => {
    const sorted = sortGamesByStatusAndStartTime([
      g('20h', '2026-07-17T20:00:00.000Z', 'ANNOUNCED'),
      g('19h', '2026-07-17T19:00:00.000Z', 'ANNOUNCED'),
      g('done', '2026-07-17T18:00:00.000Z', 'FINISHED'),
    ]);
    expect(sorted.map((x) => x.id)).toEqual(['19h', '20h', 'done']);
  });
});
