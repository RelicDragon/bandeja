import { describe, expect, it } from 'vitest';
import { convertServerResultsToRounds, pendingLeagueFixtureMatch } from './serverResultsToRounds';

describe('convertServerResultsToRounds', () => {
  it('maps prisma-shaped rounds into MatchCard matches with 0-0 default set', () => {
    const rounds = convertServerResultsToRounds({
      rounds: [
        {
          id: 'r1',
          matches: [
            {
              id: 'm1',
              teams: [
                { teamNumber: 1, players: [{ userId: 'a1' }, { user: { id: 'a2' } }] },
                { teamNumber: 2, playerIds: ['b1', 'b2'] },
              ],
              sets: [{ teamAScore: 6, teamBScore: 4, isTieBreak: false, role: 'OFFICIAL' }],
            },
          ],
        },
      ],
    });

    expect(rounds).toHaveLength(1);
    expect(rounds[0].id).toBe('r1');
    expect(rounds[0].matches[0]).toMatchObject({
      id: 'm1',
      teamA: ['a1', 'a2'],
      teamB: ['b1', 'b2'],
      sets: [{ teamA: 6, teamB: 4, isTieBreak: false, role: 'OFFICIAL' }],
    });
  });

  it('creates a 0-0 set when the server match has no sets', () => {
    const rounds = convertServerResultsToRounds({
      rounds: [
        {
          id: 'r1',
          matches: [{ id: 'm1', teams: [{ teamNumber: 1, playerIds: ['a'] }, { teamNumber: 2, playerIds: ['b'] }] }],
        },
      ],
    });
    expect(rounds[0].matches[0].sets).toEqual([{ teamA: 0, teamB: 0, isTieBreak: false }]);
  });

  it('returns empty for missing payload', () => {
    expect(convertServerResultsToRounds(null)).toEqual([]);
    expect(convertServerResultsToRounds({})).toEqual([]);
  });
});

describe('pendingLeagueFixtureMatch', () => {
  it('builds a no-sets match for unstarted fixtures', () => {
    expect(pendingLeagueFixtureMatch('g1', ['a'], ['b'])).toEqual({
      id: 'pending-g1',
      teamA: ['a'],
      teamB: ['b'],
      sets: [],
    });
  });
});
