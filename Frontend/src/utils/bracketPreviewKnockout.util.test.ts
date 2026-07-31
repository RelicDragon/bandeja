import { describe, expect, it } from 'vitest';
import { buildBracketPlan } from '@/utils/bracketStructure';
import {
  feederMatchLabelsForRound,
  feederRoundAbbrev,
  firstMainRoundFeederForVirtualSeed,
  firstMainRoundPairingsForPlan,
} from './bracketPreviewKnockout.util';

describe('bracketPreviewKnockout.util', () => {
  it('first main round pairings for 8 teams', () => {
    const plan = buildBracketPlan(8, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    expect(firstMainRoundPairingsForPlan(plan)).toEqual([
      [1, 8],
      [4, 5],
      [2, 7],
      [3, 6],
    ]);
  });

  it('maps play-in virtual slots to the actual bye and play-in winners', () => {
    const plan = buildBracketPlan(7, ['a', 'b', 'c', 'd', 'e', 'f', 'g'], {
      customByeSeedRanks: [4],
    });
    expect(firstMainRoundPairingsForPlan(plan)).toEqual([
      [1, 4],
      [2, 3],
    ]);
    expect(
      [1, 4, 2, 3].map((virtualSeed) =>
        firstMainRoundFeederForVirtualSeed(plan, virtualSeed)
      )
    ).toEqual([
      { kind: 'SEED', seed: 4 },
      { kind: 'PLAY_IN_WINNER', matchIndex: 2 },
      { kind: 'PLAY_IN_WINNER', matchIndex: 0 },
      { kind: 'PLAY_IN_WINNER', matchIndex: 1 },
    ]);
  });

  it('SF shows QF1 vs QF2', () => {
    const plan = buildBracketPlan(8, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    expect(feederMatchLabelsForRound(plan, 1, 0)).toEqual(['QF1', 'QF2']);
    expect(feederMatchLabelsForRound(plan, 1, 1)).toEqual(['QF3', 'QF4']);
  });

  it('Final shows SF1 vs SF2', () => {
    const plan = buildBracketPlan(8, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    expect(feederMatchLabelsForRound(plan, 2, 0)).toEqual(['SF1', 'SF2']);
  });

  it('feeder abbreviations', () => {
    expect(feederRoundAbbrev('quarterfinals')).toBe('QF');
    expect(feederRoundAbbrev('semifinals')).toBe('SF');
  });
});
