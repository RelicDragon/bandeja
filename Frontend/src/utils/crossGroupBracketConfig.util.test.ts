import { describe, expect, it } from 'vitest';
import { buildBracketPlan, BRACKET_MIN_ENTRANTS } from './bracketStructure';
import {
  crossGroupTotalEntrants,
  maxEqualTopKPerGroup,
} from './crossGroupBracketSeeding';
import { computeCrossGroupBracketDerived } from './crossGroupBracketConfig.util';
import type { TeamsPerGroupMap } from './crossGroupUnequalK.util';
import type { LeagueGroup, LeagueStanding } from '@/api/leagues';

function standing(id: string, points: number): LeagueStanding {
  return {
    id,
    leagueId: 'league-1',
    leagueSeasonId: 'season-1',
    participantType: 'TEAM',
    leagueTeamId: `team-${id}`,
    points,
    wins: 0,
    ties: 0,
    losses: 0,
    scoreDelta: 0,
  };
}

function group(id: string, createdAt: string): LeagueGroup {
  return {
    id,
    name: id,
    createdAt,
    updatedAt: createdAt,
    leagueSeasonId: 'season-1',
  };
}

/** Mirrors CrossGroupBracketConfigStep quick K chip eligibility. */
function eligibleTopKValues(includedGroupCount: number, minGroupSize: number): number[] {
  const maxK = maxEqualTopKPerGroup(includedGroupCount, minGroupSize);
  const kOptions = maxK >= 1 ? Array.from({ length: maxK }, (_, i) => i + 1) : [];
  return kOptions.filter(
    (n) => crossGroupTotalEntrants(n, includedGroupCount) >= BRACKET_MIN_ENTRANTS
  );
}

describe('crossGroupBracketConfig K selector', () => {
  it('omits K when K×G exceeds 16', () => {
    expect(maxEqualTopKPerGroup(6, 10)).toBe(2);
    expect(crossGroupTotalEntrants(3, 6)).toBe(18);
    const eligible = eligibleTopKValues(6, 10);
    expect(eligible).not.toContain(3);
    expect(eligible.every((k) => crossGroupTotalEntrants(k, 6) <= 16)).toBe(true);
  });

  it('caps max K at floor(16 / group count)', () => {
    expect(maxEqualTopKPerGroup(5, 20)).toBe(3);
    const eligible = eligibleTopKValues(5, 20);
    expect(eligible).not.toContain(4);
    expect(Math.max(...eligible)).toBe(3);
  });
});

describe('crossGroupBracketConfig preview pool', () => {
  it('uses global N and ids for bracket plan', () => {
    const groups = [
      group('A', '2024-01-01T00:00:00.000Z'),
      group('B', '2024-01-02T00:00:00.000Z'),
      group('C', '2024-01-03T00:00:00.000Z'),
      group('D', '2024-01-04T00:00:00.000Z'),
    ];
    const standings: Record<string, LeagueStanding[]> = {
      A: [standing('a1', 10), standing('a2', 8)],
      B: [standing('b1', 10), standing('b2', 8)],
      C: [standing('c1', 10), standing('c2', 8)],
      D: [standing('d1', 10), standing('d2', 8)],
    };
    const included = new Set(groups.map((g) => g.id));
    const teamsPerGroup: TeamsPerGroupMap = Object.fromEntries(groups.map((g) => [g.id, 2]));
    const derived = computeCrossGroupBracketDerived(
      groups,
      (gid) => standings[gid] ?? [],
      teamsPerGroup,
      included,
      'WINNERS_THEN_RUNNERS_UP',
      null
    );
    expect(derived.totalN).toBe(8);
    expect(derived.globalParticipantIds).toHaveLength(8);
    const plan = buildBracketPlan(derived.totalN, derived.globalParticipantIds);
    expect(plan.entrantCount).toBe(8);
    expect(plan.orderedParticipantIds).toHaveLength(8);
    expect(plan.orderedParticipantIds[0]).toBe('a1');
  });

  it('uses unequal teamsPerGroup for pool size and order', () => {
    const groups = [
      group('A', '2024-01-01T00:00:00.000Z'),
      group('B', '2024-01-02T00:00:00.000Z'),
      group('C', '2024-01-03T00:00:00.000Z'),
      group('D', '2024-01-04T00:00:00.000Z'),
    ];
    const standings: Record<string, LeagueStanding[]> = {
      A: [standing('a1', 12), standing('a2', 8)],
      B: [standing('b1', 10)],
      C: [standing('c1', 9), standing('c2', 7)],
      D: [standing('d1', 11)],
    };
    const included = new Set(groups.map((g) => g.id));
    const teamsPerGroup: TeamsPerGroupMap = { A: 2, B: 1, C: 2, D: 1 };
    const derived = computeCrossGroupBracketDerived(
      groups,
      (gid) => standings[gid] ?? [],
      teamsPerGroup,
      included,
      'WINNERS_THEN_RUNNERS_UP',
      null
    );
    expect(derived.totalN).toBe(6);
    expect(derived.globalParticipantIds).toEqual(['a1', 'b1', 'c1', 'd1', 'a2', 'c2']);
    const plan = buildBracketPlan(derived.totalN, derived.globalParticipantIds);
    expect(plan.entrantCount).toBe(6);
  });
});
