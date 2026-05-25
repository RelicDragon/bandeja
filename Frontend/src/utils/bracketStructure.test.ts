import { describe, expect, it } from 'vitest';
import {
  buildBracketPlan,
  getBracketStructureMetrics,
  nextPowerOf2,
  standardFirstRoundPairings,
} from './bracketStructure';

describe('nextPowerOf2', () => {
  it('maps entrant counts to bracket sizes', () => {
    expect(nextPowerOf2(2)).toBe(2);
    expect(nextPowerOf2(5)).toBe(8);
    expect(nextPowerOf2(7)).toBe(8);
    expect(nextPowerOf2(9)).toBe(16);
  });
});

describe('standardFirstRoundPairings', () => {
  it('matches NCAA order for 8 teams', () => {
    expect(standardFirstRoundPairings(8)).toEqual([
      [1, 8],
      [4, 5],
      [2, 7],
      [3, 6],
    ]);
  });
});

describe('getBracketStructureMetrics', () => {
  const cases: Array<{
    n: number;
    bracketSize: number;
    byeCount: number;
    playInGameCount: number;
    firstMain: string;
    playInPairs?: Array<[number, number]>;
  }> = [
    { n: 5, bracketSize: 8, byeCount: 3, playInGameCount: 1, firstMain: 'quarterfinals', playInPairs: [[4, 5]] },
    { n: 6, bracketSize: 8, byeCount: 2, playInGameCount: 2, firstMain: 'quarterfinals', playInPairs: [[3, 6], [4, 5]] },
    { n: 7, bracketSize: 8, byeCount: 1, playInGameCount: 3, firstMain: 'quarterfinals', playInPairs: [[2, 7], [3, 6], [4, 5]] },
    { n: 8, bracketSize: 8, byeCount: 0, playInGameCount: 0, firstMain: 'quarterfinals' },
    { n: 9, bracketSize: 16, byeCount: 7, playInGameCount: 1, firstMain: 'roundOf16', playInPairs: [[8, 9]] },
    { n: 10, bracketSize: 16, byeCount: 6, playInGameCount: 2, firstMain: 'roundOf16', playInPairs: [[7, 10], [8, 9]] },
    { n: 11, bracketSize: 16, byeCount: 5, playInGameCount: 3, firstMain: 'roundOf16', playInPairs: [[6, 11], [7, 10], [8, 9]] },
    { n: 2, bracketSize: 2, byeCount: 0, playInGameCount: 0, firstMain: 'final' },
    { n: 4, bracketSize: 4, byeCount: 0, playInGameCount: 0, firstMain: 'semifinals' },
  ];

  it.each(cases)('N=$n', ({ n, bracketSize, byeCount, playInGameCount, firstMain, playInPairs }) => {
    const m = getBracketStructureMetrics(n);
    expect(m.bracketSize).toBe(bracketSize);
    expect(m.byeCount).toBe(byeCount);
    expect(m.playInGameCount).toBe(playInGameCount);
    expect(m.firstMainRoundLabelKey).toBe(firstMain);
    if (playInPairs) {
      expect(m.playInMatchups.map((p) => [p.seedA, p.seedB])).toEqual(playInPairs);
    }
  });

  it('covers N=2..16 without throwing', () => {
    for (let n = 2; n <= 16; n += 1) {
      expect(getBracketStructureMetrics(n).entrantCount).toBe(n);
    }
  });
});

describe('buildBracketPlan', () => {
  it('attaches participant ids in seed order', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const plan = buildBracketPlan(7, ids);
    expect(plan.playInMatchups).toContainEqual(
      expect.objectContaining({
        seedA: 2,
        seedB: 7,
        participantAId: 'b',
        participantBId: 'g',
      })
    );
  });
});
