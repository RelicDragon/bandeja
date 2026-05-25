import { describe, expect, it } from 'vitest';
import { buildGroupQualifierLabels } from './groupQualifierLabel.util';
import { buildBracketPlan } from './bracketStructure';
import { firstMainRoundPairingsForPlan } from './bracketPreviewKnockout.util';
import { mergeGlobalParticipantIds } from './crossGroupBracketSeeding';

describe('groupQualifierLabel.util', () => {
  it('maps participants to A1, B2, … by group order and rank', () => {
    const groups = [
      { id: 'ga', name: 'Group A' },
      { id: 'gb', name: 'Group B' },
      { id: 'gc', name: 'Group C' },
      { id: 'gd', name: 'Group D' },
    ];
    const labels = buildGroupQualifierLabels(groups, {
      ga: ['a1', 'a2'],
      gb: ['b1', 'b2'],
      gc: ['c1', 'c2'],
      gd: ['d1', 'd2'],
    });
    expect(labels.get('a1')).toBe('A1');
    expect(labels.get('a2')).toBe('A2');
    expect(labels.get('d2')).toBe('D2');
  });

  it('labels QF pairings for 4×2 winners-then-runners-up', () => {
    const groups = [
      { id: 'ga', name: 'A' },
      { id: 'gb', name: 'B' },
      { id: 'gc', name: 'C' },
      { id: 'gd', name: 'D' },
    ];
    const qualifiers = {
      ga: ['a1', 'a2'],
      gb: ['b1', 'b2'],
      gc: ['c1', 'c2'],
      gd: ['d1', 'd2'],
    };
    const labels = buildGroupQualifierLabels(groups, qualifiers);
    const order = mergeGlobalParticipantIds(qualifiers, ['ga', 'gb', 'gc', 'gd'], 'WINNERS_THEN_RUNNERS_UP');
    const plan = buildBracketPlan(8, order);
    const pairs = firstMainRoundPairingsForPlan(plan);
    expect(pairs).toEqual([
      [1, 8],
      [4, 5],
      [2, 7],
      [3, 6],
    ]);
    const qf1 = pairs[0];
    expect(labels.get(order[qf1[0] - 1])).toBe('A1');
    expect(labels.get(order[qf1[1] - 1])).toBe('D2');
  });
});
