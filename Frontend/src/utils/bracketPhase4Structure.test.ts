import { describe, expect, it } from 'vitest';
import { buildBracketPlan, getBracketStructureMetrics } from './bracketStructure';

describe('bracket Phase 4 structure', () => {
  it('reflects custom bye seeds in metrics', () => {
    const m = getBracketStructureMetrics(7, [4]);
    expect(m.byeSeeds).toEqual([4]);
    expect(m.playInMatchups.some((p) => p.seedA === 2 && p.seedB === 7)).toBe(true);
  });

  it('buildBracketPlan uses custom bye for participant mapping', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const plan = buildBracketPlan(7, ids, { customByeSeedRanks: [4] });
    expect(plan.byeSeeds).toEqual([4]);
    const bye = plan.playInMatchups.find((p) => p.seedA === 2 && p.seedB === 7);
    expect(bye?.participantAId).toBe('b');
    expect(bye?.participantBId).toBe('g');
  });
});
