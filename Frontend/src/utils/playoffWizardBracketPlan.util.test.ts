import { describe, expect, it } from 'vitest';
import {
  bracketPlanOptionsFromWizardConfig,
  formatPlayInPairsForSummary,
} from './playoffWizardBracketPlan.util';
import { buildBracketPlan } from './bracketStructure';

describe('playoffWizardBracketPlan.util', () => {
  it('returns undefined when custom bye and play-in are off', () => {
    expect(
      bracketPlanOptionsFromWizardConfig({
        customByeEnabled: false,
        customByeSeedRanks: [1, 2],
        customPlayInEnabled: false,
        playInSeedPairs: [[5, 6]],
      })
    ).toBeUndefined();
  });

  it('passes custom bye and play-in when enabled', () => {
    expect(
      bracketPlanOptionsFromWizardConfig({
        customByeEnabled: true,
        customByeSeedRanks: [4],
        customPlayInEnabled: true,
        playInSeedPairs: [[5, 6]],
      })
    ).toEqual({
      customByeSeedRanks: [4],
      playInSeedPairs: [[5, 6]],
    });
  });

  it('buildBracketPlan reflects custom options for preview parity', () => {
    const ids = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'];
    const options = bracketPlanOptionsFromWizardConfig({
      customByeEnabled: true,
      customByeSeedRanks: [4],
      customPlayInEnabled: true,
      playInSeedPairs: [[5, 6]],
    });
    const plan = buildBracketPlan(7, ids, options);
    expect(plan.byeSeeds).toEqual([4]);
    expect(plan.playInMatchups).toEqual([
      expect.objectContaining({ seedA: 5, seedB: 6, participantAId: 'p5', participantBId: 'p6' }),
    ]);
  });

  it('formatPlayInPairsForSummary', () => {
    expect(
      formatPlayInPairsForSummary([
        [5, 6],
        [7, 8],
      ])
    ).toBe('5 vs 6, 7 vs 8');
  });
});
