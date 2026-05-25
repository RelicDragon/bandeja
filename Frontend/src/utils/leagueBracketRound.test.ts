import { describe, it, expect } from 'vitest';
import type { LeagueRound } from '@/api/leagues';
import {
  listBracketRounds,
  defaultBracketRoundId,
  resolveSelectedBracketRound,
  resolveBracketRoundIdFromSearch,
  resolveBracketRoundFromSearch,
} from './leagueBracketRound';

function round(partial: Partial<LeagueRound> & { id: string; orderIndex: number }): LeagueRound {
  return {
    sentStartMessage: false,
    createdAt: '',
    updatedAt: '',
    games: [],
    ...partial,
  };
}

describe('leagueBracketRound', () => {
  it('listBracketRounds filters BRACKET playoffs and sorts by orderIndex', () => {
    const rounds = [
      round({ id: 'b2', orderIndex: 2, roundType: 'PLAYOFF', playoffFormat: 'BRACKET' }),
      round({ id: 'r1', orderIndex: 0, roundType: 'REGULAR' }),
      round({ id: 'b1', orderIndex: 1, roundType: 'PLAYOFF', playoffFormat: 'BRACKET' }),
      round({ id: 'w1', orderIndex: 3, roundType: 'PLAYOFF', playoffFormat: 'WINNERS_COURT' }),
    ];
    expect(listBracketRounds(rounds).map((r) => r.id)).toEqual(['b1', 'b2']);
  });

  it('defaultBracketRoundId picks latest bracket round', () => {
    const playoffs = listBracketRounds([
      round({ id: 'b1', orderIndex: 0, roundType: 'PLAYOFF', playoffFormat: 'BRACKET' }),
      round({ id: 'b2', orderIndex: 1, roundType: 'PLAYOFF', playoffFormat: 'BRACKET' }),
    ]);
    expect(defaultBracketRoundId(playoffs)).toBe('b2');
  });

  it('resolveSelectedBracketRound falls back when id unknown', () => {
    const playoffs = listBracketRounds([
      round({ id: 'b1', orderIndex: 0, roundType: 'PLAYOFF', playoffFormat: 'BRACKET' }),
      round({ id: 'b2', orderIndex: 1, roundType: 'PLAYOFF', playoffFormat: 'BRACKET' }),
    ]);
    expect(resolveSelectedBracketRound(playoffs, 'missing')?.id).toBe('b2');
    expect(resolveSelectedBracketRound(playoffs, 'b1')?.id).toBe('b1');
  });

  it('resolveBracketRoundFromSearch reads roundId/round from URL (UX-A2)', () => {
    const playoffs = listBracketRounds([
      round({ id: 'b1', orderIndex: 0, roundType: 'PLAYOFF', playoffFormat: 'BRACKET' }),
      round({ id: 'b2', orderIndex: 1, roundType: 'PLAYOFF', playoffFormat: 'BRACKET' }),
    ]);
    expect(resolveBracketRoundIdFromSearch('?tab=schedule&subtab=bracket&roundId=b1')).toBe('b1');
    expect(resolveBracketRoundIdFromSearch('?round=b2')).toBe('b2');
    expect(resolveBracketRoundFromSearch(playoffs, '?roundId=b1')?.id).toBe('b1');
  });
});
