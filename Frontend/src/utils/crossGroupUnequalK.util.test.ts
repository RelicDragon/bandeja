import { describe, expect, it } from 'vitest';
import {
  buildQualifiersFromTeamsPerGroup,
  crossGroupTotalFromTeamsPerGroup,
  deriveCrossGroupPool,
  isUnequalTeamsPerGroup,
  validateUnequalCrossGroupPool,
  UnequalCrossGroupValidationError,
} from './crossGroupUnequalK.util';

function standing(id: string, points: number) {
  return { id, points, wins: 0, scoreDelta: 0 };
}

describe('crossGroupUnequalK.util', () => {
  const standingsByGroup = {
    A: [standing('a1', 12), standing('a2', 8), standing('a3', 4)],
    B: [standing('b1', 10), standing('b2', 6)],
    C: [standing('c1', 9), standing('c2', 7), standing('c3', 5)],
    D: [standing('d1', 11), standing('d2', 3)],
  };

  it('totals K per group', () => {
    expect(
      crossGroupTotalFromTeamsPerGroup({ A: 2, B: 1, C: 2, D: 1 }, ['A', 'B', 'C', 'D'])
    ).toBe(6);
  });

  it('detects unequal K', () => {
    expect(isUnequalTeamsPerGroup({ A: 2, B: 1, C: 2, D: 1 }, ['A', 'B', 'C', 'D'])).toBe(true);
    expect(isUnequalTeamsPerGroup({ A: 2, B: 2, C: 2, D: 2 }, ['A', 'B', 'C', 'D'])).toBe(false);
  });

  it('builds variable-length qualifiers', () => {
    const q = buildQualifiersFromTeamsPerGroup(standingsByGroup, { A: 2, B: 1, C: 2, D: 1 }, [
      'A',
      'B',
      'C',
      'D',
    ]);
    expect(q.A).toEqual(['a1', 'a2']);
    expect(q.B).toEqual(['b1']);
    expect(q.C).toEqual(['c1', 'c2']);
    expect(q.D).toEqual(['d1']);
  });

  it('merges global order with winners-then-runners-up for unequal K', () => {
    const { globalParticipantIds, totalN } = deriveCrossGroupPool({
      standingsByGroup,
      includedGroupIds: ['A', 'B', 'C', 'D'],
      teamsPerGroup: { A: 2, B: 1, C: 2, D: 1 },
      seedingPreset: 'WINNERS_THEN_RUNNERS_UP',
    });
    expect(totalN).toBe(6);
    expect(globalParticipantIds).toEqual(['a1', 'b1', 'c1', 'd1', 'a2', 'c2']);
  });

  it('validates total ≤ 16 and ≥ 2', () => {
    const { qualifiers, globalParticipantIds } = deriveCrossGroupPool({
      standingsByGroup,
      includedGroupIds: ['A', 'B', 'C', 'D'],
      teamsPerGroup: { A: 2, B: 1, C: 2, D: 1 },
      seedingPreset: 'GROUP_BLOCK',
    });
    expect(() =>
      validateUnequalCrossGroupPool({
        includedGroupIds: ['A', 'B', 'C', 'D'],
        qualifiers,
        globalParticipantIds,
      })
    ).not.toThrow();
  });

  it('rejects total over 16', () => {
    const included = ['A', 'B', 'C', 'D', 'E', 'F'];
    const qualifiers = {
      A: ['a1', 'a2', 'a3'],
      B: ['b1', 'b2', 'b3'],
      C: ['c1', 'c2', 'c3'],
      D: ['d1', 'd2', 'd3'],
      E: ['e1', 'e2', 'e3'],
      F: ['f1', 'f2', 'f3'],
    };
    const globalParticipantIds = Object.values(qualifiers).flat();
    expect(globalParticipantIds.length).toBe(18);
    expect(() =>
      validateUnequalCrossGroupPool({ includedGroupIds: included, qualifiers, globalParticipantIds })
    ).toThrow(UnequalCrossGroupValidationError);
  });

  it('rejects group smaller than requested K', () => {
    try {
      validateUnequalCrossGroupPool({
        includedGroupIds: ['A', 'B'],
        qualifiers: { A: ['a1'], B: ['b1', 'b2'] },
        globalParticipantIds: ['a1', 'b1', 'b2'],
        teamsPerGroup: { A: 2, B: 2 },
      });
      expect.fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(UnequalCrossGroupValidationError);
      expect((e as UnequalCrossGroupValidationError).code).toBe('GROUP_TOO_SMALL');
    }
  });
});
