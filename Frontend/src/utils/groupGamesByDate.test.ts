import { describe, expect, it, vi } from 'vitest';
import type { Game } from '@/types';
import { groupGamesByDate } from './groupGamesByDate';

vi.mock('@/utils/gameTimeDisplay', () => ({
  getClubTimezone: () => null,
  getDateLabelInClubTz: () => '',
}));

vi.mock('@/utils/dateFormat', () => ({
  formatDate: (iso: string, pattern: string) => {
    if (pattern === 'EEEE') return 'Friday';
    if (pattern === 'd MMM') return '17 Jul';
    return iso;
  },
}));

function g(id: string, startTime: string): Game {
  return { id, startTime } as Game;
}

describe('groupGamesByDate', () => {
  it('sorts games within a day by startTime ascending', () => {
    const groups = groupGamesByDate(
      [
        g('20h', '2026-07-17T20:00:00.000Z'),
        g('19h', '2026-07-17T19:00:00.000Z'),
      ],
      { weekStart: 1 } as never,
      ((key: string) => key) as never,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].games.map((x) => x.id)).toEqual(['19h', '20h']);
  });
});
