import { describe, expect, it } from 'vitest';
import type { Game } from '@/types';
import { getLeagueHomeGameMatchup } from './leagueHomeGameMatchup';

function gameWithTeams(): Game {
  return {
    id: 'g1',
    entityType: 'LEAGUE',
    gameType: 'COMPETITIVE',
    city: { id: 'c1', name: 'City', country: 'X' },
    startTime: '2026-01-01T10:00:00Z',
    endTime: '2026-01-01T12:00:00Z',
    maxParticipants: 4,
    minParticipants: 4,
    isPublic: false,
    affectsRating: false,
    allowDirectJoin: false,
    status: 'ANNOUNCED',
    resultsStatus: 'NONE',
    participants: [],
    fixedTeams: [
      {
        id: 't1',
        gameId: 'g1',
        teamNumber: 1,
        players: [
          {
            id: 'p1',
            gameTeamId: 't1',
            userId: 'me',
            user: { id: 'me', firstName: 'Alex', lastName: 'Me' },
          },
          {
            id: 'p2',
            gameTeamId: 't1',
            userId: 'partner',
            user: { id: 'partner', firstName: 'Sam', lastName: 'Partner' },
          },
        ],
      },
      {
        id: 't2',
        gameId: 'g1',
        teamNumber: 2,
        name: 'Rivals',
        players: [
          {
            id: 'p3',
            gameTeamId: 't2',
            userId: 'o1',
            user: { id: 'o1', firstName: 'Bo', lastName: 'One' },
          },
          {
            id: 'p4',
            gameTeamId: 't2',
            userId: 'o2',
            user: { id: 'o2', firstName: 'Cy', lastName: 'Two' },
          },
        ],
      },
    ],
  } as Game;
}

describe('getLeagueHomeGameMatchup', () => {
  it('returns partner users and named opponent team', () => {
    expect(getLeagueHomeGameMatchup(gameWithTeams(), 'me')).toEqual({
      teammates: [{ id: 'partner', firstName: 'Sam', lastName: 'Partner' }],
      opponents: [
        { id: 'o1', firstName: 'Bo', lastName: 'One' },
        { id: 'o2', firstName: 'Cy', lastName: 'Two' },
      ],
      opponentTeamName: 'Rivals',
    });
  });

  it('omits opponent team name when unset', () => {
    const game = gameWithTeams();
    game.fixedTeams![1].name = undefined;
    expect(getLeagueHomeGameMatchup(game, 'me')?.opponentTeamName).toBeUndefined();
  });
});
