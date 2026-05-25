import { describe, expect, it } from 'vitest';
import type { LeagueRound } from '@/api/leagues';
import { leagueRoundHeaderFormatLabelKey } from './leagueRoundAccordionHeader.util';

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

describe('leagueRoundAccordionHeader.util (UX-C11)', () => {
  it('returns null for regular rounds', () => {
    expect(leagueRoundHeaderFormatLabelKey(round({ id: 'r1', orderIndex: 0, roundType: 'REGULAR' }))).toBeNull();
  });

  it('returns bracket label for per-group bracket round', () => {
    expect(
      leagueRoundHeaderFormatLabelKey(
        round({ id: 'r1', orderIndex: 1, roundType: 'PLAYOFF', playoffFormat: 'BRACKET', bracketScope: 'PER_GROUP' })
      )
    ).toBe('gameDetails.roundHeaderBracket');
  });

  it('returns season playoff label for cross-group bracket round', () => {
    expect(
      leagueRoundHeaderFormatLabelKey(
        round({ id: 'r1', orderIndex: 2, roundType: 'PLAYOFF', playoffFormat: 'BRACKET', bracketScope: 'CROSS_GROUP' })
      )
    ).toBe('gameDetails.roundHeaderSeasonPlayoffBracket');
  });

  it('returns session label for session playoff round', () => {
    expect(
      leagueRoundHeaderFormatLabelKey(
        round({ id: 'r1', orderIndex: 3, roundType: 'PLAYOFF', playoffFormat: 'SESSION' })
      )
    ).toBe('gameDetails.roundHeaderSessionPlayoff');
  });
});
