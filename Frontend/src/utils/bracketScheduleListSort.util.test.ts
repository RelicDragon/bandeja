import { describe, expect, it } from 'vitest';
import type { BracketSlotDto } from '@/api/leagues';
import {
  collectBracketScheduleGames,
  sortBracketScheduleGames,
  type BracketScheduleListEntry,
} from './bracketScheduleListSort.util';

describe('sortBracketScheduleGames', () => {
  it('orders every fixture chronologically with deterministic bracket tie breaks', () => {
    const entries: BracketScheduleListEntry[] = [
      { entryType: 'GAME', kind: 'MAIN', roundIndex: 1, roundLabel: null, startTime: '2026-01-03', slot: { matchIndex: 0 } as never, game: { id: 'm1', startTime: '2026-01-03' } as never },
      { entryType: 'GAME', kind: 'PLAY_IN', roundIndex: 0, roundLabel: null, startTime: '2026-01-02', slot: { matchIndex: 0 } as never, game: { id: 'p2', startTime: '2026-01-02' } as never },
      { entryType: 'GAME', kind: 'MAIN', roundIndex: 0, roundLabel: null, startTime: '2026-01-04', slot: { matchIndex: 0 } as never, game: { id: 'm0', startTime: '2026-01-04' } as never },
      { entryType: 'GAME', kind: 'PLAY_IN', roundIndex: 0, roundLabel: null, startTime: '2026-01-01', slot: { matchIndex: 0 } as never, game: { id: 'p1', startTime: '2026-01-01' } as never },
    ];
    const sorted = sortBracketScheduleGames(entries).map((e) => e.game?.id);
    expect(sorted).toEqual(['p1', 'p2', 'm1', 'm0']);
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
    expect(list.map((e) => e.game?.id)).toEqual(['g2', 'g1']);
  });

  it('includes scheduled future fixtures without creating fake games', () => {
    const slots = [{
      id: 'slot-final',
      slotKey: 'MAIN-R2-M0',
      slotKind: 'MAIN',
      roundIndex: 2,
      matchIndex: 0,
      schedule: {
        clubId: 'ksc',
        courtId: 'court-3',
        startTime: '2026-08-02T13:00:00.000Z',
        endTime: '2026-08-02T14:00:00.000Z',
      },
    }] as BracketSlotDto[];
    expect(collectBracketScheduleGames(slots)[0]).toMatchObject({
      entryType: 'PLANNED',
      game: null,
      startTime: '2026-08-02T13:00:00.000Z',
    });
  });
});
