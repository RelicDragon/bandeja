import { describe, expect, it } from 'vitest';
import { getMatchScoresForDelta, getSetScoreForDelta } from './setScoreDelta';

const automaticRules = { strictValidation: 'CLASSIC_AUTOMATIC_RELAXED' as const };

describe('setScoreDelta', () => {
  it('legacy: sums games and counts tiebreak as one set won', () => {
    const sets = [
      { teamA: 6, teamB: 4, isTieBreak: false },
      { teamA: 7, teamB: 5, isTieBreak: true },
    ];
    expect(getMatchScoresForDelta(sets)).toEqual({ teamAScore: 7, teamBScore: 4 });
    expect(getSetScoreForDelta(sets[1], 'A', 1, sets)).toBe(1);
  });

  it('automatic americano: sums point rows', () => {
    const sets = [
      { teamA: 24, teamB: 18, isTieBreak: false },
      { teamA: 22, teamB: 24, isTieBreak: false },
    ];
    const context = {
      matchMetadata: { automaticRecordMode: 'AMERICANO_POINTS' },
      rules: automaticRules,
    };
    expect(getMatchScoresForDelta(sets, context)).toEqual({ teamAScore: 46, teamBScore: 42 });
  });

  it('automatic games without metadata defaults to game sums', () => {
    const sets = [{ teamA: 6, teamB: 4, isTieBreak: false }];
    expect(
      getMatchScoresForDelta(sets, { matchMetadata: {}, rules: automaticRules }),
    ).toEqual({ teamAScore: 6, teamBScore: 4 });
  });

  it('automatic super tiebreak decider counts as one', () => {
    const sets = [
      { teamA: 6, teamB: 4, isTieBreak: false },
      { teamA: 4, teamB: 6, isTieBreak: false },
      { teamA: 10, teamB: 8, isTieBreak: true },
    ];
    const context = {
      matchMetadata: { automaticRecordMode: 'GAMES' },
      rules: automaticRules,
    };
    expect(getMatchScoresForDelta(sets, context)).toEqual({ teamAScore: 11, teamBScore: 10 });
  });

  it('uses embedded automaticSetKind when metadata context is omitted', () => {
    const sets = [
      { teamA: 24, teamB: 18, automaticSetKind: 'AMERICANO_POINTS' as const },
    ];
    expect(getMatchScoresForDelta(sets)).toEqual({ teamAScore: 24, teamBScore: 18 });
  });
});
