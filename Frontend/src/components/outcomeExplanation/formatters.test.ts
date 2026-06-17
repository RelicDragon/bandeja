import { describe, expect, it } from 'vitest';
import { groupMatchesByRound } from './formatters';
import type { MatchExplanation } from '@/api/results';

function makeMatch(matchNumber: number, roundNumber: number): MatchExplanation {
  return {
    matchNumber,
    roundNumber,
    isWinner: true,
    isDraw: false,
    opponentLevel: 3.4,
    levelDifference: 0.1,
    levelChange: 0.04,
    pointsEarned: 1,
    teammates: [],
    opponents: [],
  };
}

describe('groupMatchesByRound', () => {
  it('groups and sorts rounds deterministically', () => {
    const matches = [
      makeMatch(2, 2),
      makeMatch(1, 1),
      makeMatch(3, 2),
      makeMatch(4, 1),
    ];
    const { grouped, sortedRounds } = groupMatchesByRound(matches);
    expect(sortedRounds).toEqual([1, 2]);
    expect(grouped[1].map((m) => m.matchNumber)).toEqual([1, 4]);
    expect(grouped[2].map((m) => m.matchNumber)).toEqual([2, 3]);
  });
});
