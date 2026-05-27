import { describe, expect, it } from 'vitest';
import {
  buildFivePlayerAllMatchCombinations,
  canCreateAllFivePlayerCombinations,
  shouldShowRoundAddedModal,
} from './fivePlayerMatchCombinations';

describe('buildFivePlayerAllMatchCombinations', () => {
  it('returns 15 unique pairings for 5 players', () => {
    const players = ['a', 'b', 'c', 'd', 'e'];
    const matches = buildFivePlayerAllMatchCombinations(players);

    expect(matches).toHaveLength(15);

    const keys = new Set(
      matches.map(({ teamA, teamB }) => {
        const pair = (team: [string, string]) => [...team].sort().join('-');
        return [pair(teamA), pair(teamB)].sort().join('|');
      }),
    );
    expect(keys.size).toBe(15);
  });
});

describe('canCreateAllFivePlayerCombinations', () => {
  it('allows empty rounds for five players without fixed teams', () => {
    expect(canCreateAllFivePlayerCombinations(5, false, [])).toBe(true);
  });

  it('allows one empty match in a single round', () => {
    expect(
      canCreateAllFivePlayerCombinations(5, false, [
        {
          id: 'r1',
          matches: [{ id: 'm1', teamA: [], teamB: [], sets: [{ teamA: 0, teamB: 0 }] }],
        },
      ]),
    ).toBe(true);
  });

  it('rejects fixed teams and multiple rounds', () => {
    expect(canCreateAllFivePlayerCombinations(5, true, [])).toBe(false);
    expect(
      canCreateAllFivePlayerCombinations(5, false, [
        { id: 'r1', matches: [] },
        { id: 'r2', matches: [] },
      ]),
    ).toBe(false);
  });
});

describe('shouldShowRoundAddedModal', () => {
  const emptyMatch = { id: 'm1', teamA: [], teamB: [], sets: [{ teamA: 0, teamB: 0 }] };
  const filledMatch = { id: 'm1', teamA: ['a', 'b'], teamB: ['c', 'd'], sets: [{ teamA: 0, teamB: 0 }] };

  it('returns false when there are no matches', () => {
    expect(shouldShowRoundAddedModal({ id: 'r1', matches: [] })).toBe(false);
    expect(shouldShowRoundAddedModal(null)).toBe(false);
  });

  it('returns false for a single empty match', () => {
    expect(shouldShowRoundAddedModal({ id: 'r1', matches: [emptyMatch] })).toBe(false);
  });

  it('returns true when the single match has players or scores', () => {
    expect(shouldShowRoundAddedModal({ id: 'r1', matches: [filledMatch] })).toBe(true);
  });

  it('returns true for multiple matches even if the first is empty', () => {
    expect(shouldShowRoundAddedModal({ id: 'r1', matches: [emptyMatch, filledMatch] })).toBe(true);
  });
});
