import { describe, expect, it } from 'vitest';
import {
  buildEqualTopKQualifiers,
  compareStandingsForBracket,
  crossGroupTotalEntrants,
  maxEqualTopKPerGroup,
  mergeGlobalParticipantIds,
  sortCanonicalGroups,
  validateCrossGroupPool,
  CrossGroupPoolValidationError,
} from './crossGroupBracketSeeding';

function standing(id: string, points: number, wins = 0, scoreDelta = 0) {
  return { id, points, wins, scoreDelta };
}

describe('compareStandingsForBracket', () => {
  it('orders by points then wins then scoreDelta', () => {
    const rows = [standing('c', 10, 5, 2), standing('a', 12), standing('b', 10, 6, 1)];
    const sorted = [...rows].sort(compareStandingsForBracket);
    expect(sorted.map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('sortCanonicalGroups', () => {
  it('sorts by createdAt ascending', () => {
    const groups = [
      { id: 'B', createdAt: '2024-02-01T00:00:00.000Z' },
      { id: 'A', createdAt: '2024-01-01T00:00:00.000Z' },
    ];
    expect(sortCanonicalGroups(groups).map((g) => g.id)).toEqual(['A', 'B']);
  });
});

describe('maxEqualTopKPerGroup', () => {
  it('caps by floor(16/G) and min group size', () => {
    expect(maxEqualTopKPerGroup(4, 5)).toBe(4);
    expect(maxEqualTopKPerGroup(4, 2)).toBe(2);
    expect(maxEqualTopKPerGroup(8, 10)).toBe(2);
  });
});

describe('buildEqualTopKQualifiers', () => {
  it('takes top K per included group by standings', () => {
    const standingsByGroup = {
      A: [standing('a2', 8), standing('a1', 12)],
      B: [standing('b1', 10), standing('b2', 6)],
      C: [standing('c1', 5)],
    };
    const q = buildEqualTopKQualifiers(standingsByGroup, 2, ['A', 'B']);
    expect(q.A).toEqual(['a1', 'a2']);
    expect(q.B).toEqual(['b1', 'b2']);
    expect(q.C).toBeUndefined();
  });
});

describe('mergeGlobalParticipantIds', () => {
  const qualifiers = {
    A: ['a1', 'a2'],
    B: ['b1', 'b2'],
    C: ['c1', 'c2'],
    D: ['d1', 'd2'],
  };
  const order = ['A', 'B', 'C', 'D'];

  it('WINNERS_THEN_RUNNERS_UP interleaves ranks across groups', () => {
    expect(
      mergeGlobalParticipantIds(qualifiers, order, 'WINNERS_THEN_RUNNERS_UP')
    ).toEqual(['a1', 'b1', 'c1', 'd1', 'a2', 'b2', 'c2', 'd2']);
  });

  it('GROUP_BLOCK keeps each group block', () => {
    expect(mergeGlobalParticipantIds(qualifiers, order, 'GROUP_BLOCK')).toEqual([
      'a1',
      'a2',
      'b1',
      'b2',
      'c1',
      'c2',
      'd1',
      'd2',
    ]);
  });

  it('MANUAL uses provided order', () => {
    expect(
      mergeGlobalParticipantIds(qualifiers, order, 'MANUAL', ['d2', 'a1', 'b1'])
    ).toEqual(['d2', 'a1', 'b1']);
  });

  it('honors preview reorder when client order matches preset participant set', () => {
    const previewOrder = ['d2', 'c2', 'b2', 'a2', 'd1', 'c1', 'b1', 'a1'];
    expect(
      mergeGlobalParticipantIds(qualifiers, order, 'WINNERS_THEN_RUNNERS_UP', previewOrder)
    ).toEqual(previewOrder);
  });
});

describe('validateCrossGroupPool', () => {
  it('accepts valid 4×2 pool', () => {
    expect(() =>
      validateCrossGroupPool({
        k: 2,
        includedGroupIds: ['A', 'B', 'C', 'D'],
        qualifiers: {
          A: ['a1', 'a2'],
          B: ['b1', 'b2'],
          C: ['c1', 'c2'],
          D: ['d1', 'd2'],
        },
        globalParticipantIds: [
          'a1',
          'b1',
          'c1',
          'd1',
          'a2',
          'b2',
          'c2',
          'd2',
        ],
      })
    ).not.toThrow();
  });

  it('rejects fewer than 2 groups', () => {
    expect(() =>
      validateCrossGroupPool({
        k: 2,
        includedGroupIds: ['A'],
        qualifiers: { A: ['a1', 'a2'] },
        globalParticipantIds: ['a1', 'a2'],
      })
    ).toThrow(CrossGroupPoolValidationError);
  });

  it('rejects total over 16', () => {
    const ids = ['a1', 'a2', 'a3', 'b1', 'b2', 'b3', 'c1', 'c2', 'c3', 'd1', 'd2', 'd3', 'e1', 'e2', 'e3', 'f1', 'f2', 'f3'];
    const bigQualifiers = {
      A: ['a1', 'a2', 'a3'],
      B: ['b1', 'b2', 'b3'],
      C: ['c1', 'c2', 'c3'],
      D: ['d1', 'd2', 'd3'],
      E: ['e1', 'e2', 'e3'],
      F: ['f1', 'f2', 'f3'],
    };
    try {
      validateCrossGroupPool({
        k: 3,
        includedGroupIds: ['A', 'B', 'C', 'D', 'E', 'F'],
        qualifiers: bigQualifiers,
        globalParticipantIds: ids,
      });
      expect.fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(CrossGroupPoolValidationError);
      expect((e as CrossGroupPoolValidationError).code).toBe('TOTAL_OVER_MAX');
    }
  });

  it('rejects group with fewer than K teams', () => {
    try {
      validateCrossGroupPool({
        k: 2,
        includedGroupIds: ['A', 'B'],
        qualifiers: { A: ['a1'], B: ['b1', 'b2'] },
        globalParticipantIds: ['a1', 'b1', 'b2', 'x'],
      });
      expect.fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(CrossGroupPoolValidationError);
      expect((e as CrossGroupPoolValidationError).code).toBe('GROUP_TOO_SMALL');
    }
  });
});

describe('crossGroupTotalEntrants', () => {
  it('multiplies K by included group count', () => {
    expect(crossGroupTotalEntrants(2, 4)).toBe(8);
  });
});
