import { describe, expect, it } from 'vitest';
import type { LeagueRound } from '@/api/leagues';
import {
  playoffRoundTypeFilterLabelKey,
  resolvePlayoffFilterLabelMode,
} from './roundTypePlayoffFilterLabel.util';

function round(partial: Partial<LeagueRound> & { id: string; orderIndex: number }): LeagueRound {
  return {
    leagueSeasonId: 's1',
    sentStartMessage: false,
    createdAt: '',
    updatedAt: '',
    games: [],
    ...partial,
  };
}

describe('roundTypePlayoffFilterLabel.util (UX-C13)', () => {
  it('uses bracket label when only bracket playoffs exist', () => {
    const mode = resolvePlayoffFilterLabelMode([
      round({ id: 'r1', orderIndex: 0, roundType: 'REGULAR' }),
      round({ id: 'r2', orderIndex: 1, roundType: 'PLAYOFF', playoffFormat: 'BRACKET' }),
    ]);
    expect(mode).toBe('bracket');
    expect(playoffRoundTypeFilterLabelKey(mode)).toBe('gameDetails.roundTypePlayoffBracket');
  });

  it('uses session label when only session playoffs exist', () => {
    const mode = resolvePlayoffFilterLabelMode([
      round({ id: 'r1', orderIndex: 1, roundType: 'PLAYOFF', playoffFormat: 'SESSION' }),
    ]);
    expect(mode).toBe('session');
    expect(playoffRoundTypeFilterLabelKey(mode)).toBe('gameDetails.roundTypePlayoffSession');
  });

  it('uses mixed label when both formats exist', () => {
    const mode = resolvePlayoffFilterLabelMode([
      round({ id: 'b1', orderIndex: 1, roundType: 'PLAYOFF', playoffFormat: 'BRACKET' }),
      round({ id: 's1', orderIndex: 2, roundType: 'PLAYOFF', playoffFormat: 'SESSION' }),
    ]);
    expect(mode).toBe('mixed');
    expect(playoffRoundTypeFilterLabelKey(mode)).toBe('gameDetails.roundTypePlayoffMixed');
  });
});
