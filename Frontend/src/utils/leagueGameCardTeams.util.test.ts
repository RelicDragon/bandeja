import { describe, expect, it } from 'vitest';
import type { Game } from '@/types';
import { resolveLeagueGameCardTeams } from './leagueGameCardTeams.util';

describe('resolveLeagueGameCardTeams', () => {
  it('1v1 fixed teams: one player per side', () => {
    const game = {
      fixedTeams: [
        {
          teamNumber: 1,
          players: [{ user: { id: 'u1', firstName: 'A', lastName: 'One' } }],
        },
        {
          teamNumber: 2,
          players: [{ user: { id: 'u2', firstName: 'B', lastName: 'Two' } }],
        },
      ],
    } as Game;

    expect(resolveLeagueGameCardTeams(game)).toEqual({
      teamA: [{ id: 'u1', firstName: 'A', lastName: 'One' }],
      teamB: [{ id: 'u2', firstName: 'B', lastName: 'Two' }],
    });
  });

  it('1v1 participants without fixed teams: splits two players', () => {
    const game = {
      fixedTeams: [],
      participants: [
        { status: 'PLAYING', user: { id: 'u1', firstName: 'A', lastName: 'One' } },
        { status: 'PLAYING', user: { id: 'u2', firstName: 'B', lastName: 'Two' } },
      ],
    } as Game;

    expect(resolveLeagueGameCardTeams(game)).toEqual({
      teamA: [{ id: 'u1', firstName: 'A', lastName: 'One' }],
      teamB: [{ id: 'u2', firstName: 'B', lastName: 'Two' }],
    });
  });

  it('caps stale doubles slot when playersPerMatch is 2', () => {
    const game = {
      playersPerMatch: 2,
      fixedTeams: [
        {
          teamNumber: 1,
          players: [
            { user: { id: 'u1', firstName: 'A', lastName: 'One' } },
            { user: { id: 'u3', firstName: 'A', lastName: 'Partner' } },
          ],
        },
        {
          teamNumber: 2,
          players: [{ user: { id: 'u2', firstName: 'B', lastName: 'Two' } }],
        },
      ],
    } as Game;

    expect(resolveLeagueGameCardTeams(game).teamA.map((p) => p.id)).toEqual(['u1']);
    expect(resolveLeagueGameCardTeams(game).teamB.map((p) => p.id)).toEqual(['u2']);
  });
});
