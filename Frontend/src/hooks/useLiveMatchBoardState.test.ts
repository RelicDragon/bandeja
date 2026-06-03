import { describe, expect, it } from 'vitest';
import type { Game } from '@/types';
import { liveBoardPlayersForTeam, type RawMatch } from './useLiveMatchBoardState';

function singlesMatch(): RawMatch {
  return {
    id: 'm1',
    teams: [
      {
        teamNumber: 1,
        players: [{ user: { id: 'u1', firstName: 'Alex', lastName: 'One' } }],
      },
      {
        teamNumber: 2,
        players: [{ user: { id: 'u2', firstName: 'Bo', lastName: 'Two' } }],
      },
    ],
  };
}

describe('liveBoardPlayersForTeam', () => {
  it('1v1: returns one player per side for TV/broadcast rosters', () => {
    const game = { playersPerMatch: 2, participants: [] } as Game;
    const match = singlesMatch();

    expect(liveBoardPlayersForTeam(match, 1, game)).toEqual([
      expect.objectContaining({ id: 'u1', firstName: 'Alex', lastName: 'One' }),
    ]);
    expect(liveBoardPlayersForTeam(match, 2, game)).toEqual([
      expect.objectContaining({ id: 'u2', firstName: 'Bo', lastName: 'Two' }),
    ]);
  });

  it('caps extras when game is singles but match team has stale doubles slot', () => {
    const game = { playersPerMatch: 2, sport: 'TENNIS', participants: [] } as Game;
    const match: RawMatch = {
      id: 'm1',
      teams: [
        {
          teamNumber: 1,
          players: [
            { user: { id: 'u1', firstName: 'A', lastName: '1' } },
            { user: { id: 'u3', firstName: 'A', lastName: '2' } },
          ],
        },
        {
          teamNumber: 2,
          players: [{ user: { id: 'u2', firstName: 'B', lastName: '1' } }],
        },
      ],
    };

    expect(liveBoardPlayersForTeam(match, 1, game).map((p) => p.id)).toEqual(['u1']);
    expect(liveBoardPlayersForTeam(match, 2, game).map((p) => p.id)).toEqual(['u2']);
  });

  it('2v2: returns two players per side when playersPerMatch is 4', () => {
    const game = { playersPerMatch: 4, participants: [] } as Game;
    const match: RawMatch = {
      id: 'm1',
      teams: [
        {
          teamNumber: 1,
          players: [
            { user: { id: 'a1', firstName: 'A', lastName: '1' } },
            { user: { id: 'a2', firstName: 'A', lastName: '2' } },
          ],
        },
        {
          teamNumber: 2,
          players: [
            { user: { id: 'b1', firstName: 'B', lastName: '1' } },
            { user: { id: 'b2', firstName: 'B', lastName: '2' } },
          ],
        },
      ],
    };

    expect(liveBoardPlayersForTeam(match, 1, game)).toHaveLength(2);
    expect(liveBoardPlayersForTeam(match, 2, game)).toHaveLength(2);
  });
});
