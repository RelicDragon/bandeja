import { describe, expect, it } from 'vitest';
import type { BracketSlotDto } from '@/api/leagues';
import {
  collectBracketScheduleGames,
  sortBracketScheduleGames,
  type BracketScheduleListEntry,
} from './bracketScheduleListSort.util';

describe('sortBracketScheduleGames', () => {
  it('orders play-in before main by roundIndex then startTime', () => {
    const entries: BracketScheduleListEntry[] = [
      { kind: 'MAIN', roundIndex: 1, roundLabel: null, game: { id: 'm1', startTime: '2026-01-03' } as never },
      { kind: 'PLAY_IN', roundIndex: 0, roundLabel: null, game: { id: 'p2', startTime: '2026-01-02' } as never },
      { kind: 'MAIN', roundIndex: 0, roundLabel: null, game: { id: 'm0', startTime: '2026-01-04' } as never },
      { kind: 'PLAY_IN', roundIndex: 0, roundLabel: null, game: { id: 'p1', startTime: '2026-01-01' } as never },
    ];
    const sorted = sortBracketScheduleGames(entries).map((e) => e.game.id);
    expect(sorted).toEqual(['p1', 'p2', 'm0', 'm1']);
  });
});

describe('collectBracketScheduleGames', () => {
  it('dedupes games and applies bracket sort', () => {
    const game = (id: string, startTime: string) =>
      ({ id, startTime, resultsStatus: 'NONE', fixedTeams: [] }) as BracketSlotDto['game'];

    const slots = [
      { slotKind: 'MAIN', roundIndex: 0, game: game('g1', '2026-02-02') },
      { slotKind: 'PLAY_IN', roundIndex: 0, game: game('g2', '2026-02-01') },
      { slotKind: 'PLAY_IN', roundIndex: 0, game: game('g2', '2026-02-01') },
    ] as BracketSlotDto[];

    const list = collectBracketScheduleGames(slots);
    expect(list.map((e) => e.game.id)).toEqual(['g2', 'g1']);
  });
});
