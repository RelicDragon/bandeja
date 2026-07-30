import { describe, expect, it } from 'vitest';
import { buildBracketPlan, getBracketStructureMetrics } from './bracketStructure';

describe('bracket Phase 4 structure', () => {
  it('reflects custom bye seeds in metrics with full play-in coverage', () => {
    const m = getBracketStructureMetrics(7, [4]);
    expect(m.byeSeeds).toEqual([4]);
    expect(m.playInMatchups).toHaveLength(3);
    const covered = m.playInMatchups.flatMap((p) => [p.seedA, p.seedB]).sort((a, b) => a - b);
    expect(covered).toEqual([1, 2, 3, 5, 6, 7]);
  });

  it('buildBracketPlan uses custom bye for participant mapping', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const plan = buildBracketPlan(7, ids, { customByeSeedRanks: [4] });
    expect(plan.byeSeeds).toEqual([4]);
    expect(plan.playInMatchups).toHaveLength(3);
    const coveredIds = plan.playInMatchups
      .flatMap((p) => [p.participantAId, p.participantBId])
      .sort();
    expect(coveredIds).toEqual(['a', 'b', 'c', 'e', 'f', 'g']);
  });
});
