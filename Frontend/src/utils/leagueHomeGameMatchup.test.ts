import { describe, expect, it } from 'vitest';
import type { Game } from '@/types';
import {
  getLeagueHomeGameMatchup,
  getLeagueHomeOpponentRowDisplay,
} from './leagueHomeGameMatchup';

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
      self: { id: 'me', firstName: 'Alex', lastName: 'Me' },
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

  it('1v1 fixed teams: no partner, single opponent', () => {
    const game = {
      ...gameWithTeams(),
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
          ],
        },
        {
          id: 't2',
          gameId: 'g1',
          teamNumber: 2,
          players: [
            {
              id: 'p3',
              gameTeamId: 't2',
              userId: 'o1',
              user: { id: 'o1', firstName: 'Bo', lastName: 'One' },
            },
          ],
        },
      ],
    } as Game;

    expect(getLeagueHomeGameMatchup(game, 'me')).toEqual({
      self: { id: 'me', firstName: 'Alex', lastName: 'Me' },
      teammates: [],
      opponents: [{ id: 'o1', firstName: 'Bo', lastName: 'One' }],
      opponentTeamName: undefined,
    });
    expect(getLeagueHomeGameMatchup(game, 'o1')).toEqual({
      self: { id: 'o1', firstName: 'Bo', lastName: 'One' },
      teammates: [],
      opponents: [{ id: 'me', firstName: 'Alex', lastName: 'Me' }],
      opponentTeamName: undefined,
    });
  });

  it('1v1 participants (no fixed teams): splits two players correctly', () => {
    const game = {
      id: 'g2',
      entityType: 'LEAGUE',
      gameType: 'COMPETITIVE',
      city: { id: 'c1', name: 'City', country: 'X' },
      startTime: '2026-01-01T10:00:00Z',
      endTime: '2026-01-01T12:00:00Z',
      maxParticipants: 2,
      minParticipants: 2,
      isPublic: false,
      affectsRating: false,
      allowDirectJoin: false,
      status: 'ANNOUNCED',
      resultsStatus: 'NONE',
      fixedTeams: [],
      participants: [
        {
          userId: 'me',
          status: 'PLAYING',
          user: { id: 'me', firstName: 'Alex', lastName: 'Me' },
        },
        {
          userId: 'o1',
          status: 'PLAYING',
          user: { id: 'o1', firstName: 'Bo', lastName: 'One' },
        },
      ],
    } as Game;

    expect(getLeagueHomeGameMatchup(game, 'me')).toEqual({
      self: { id: 'me', firstName: 'Alex', lastName: 'Me' },
      teammates: [],
      opponents: [{ id: 'o1', firstName: 'Bo', lastName: 'One' }],
    });
    expect(getLeagueHomeGameMatchup(game, 'o1')).toEqual({
      self: { id: 'o1', firstName: 'Bo', lastName: 'One' },
      teammates: [],
      opponents: [{ id: 'me', firstName: 'Alex', lastName: 'Me' }],
    });
  });
});

describe('getLeagueHomeOpponentRowDisplay', () => {
  const opp = { id: 'o1', firstName: 'Bo', lastName: 'One' };
  const opp2 = { id: 'o2', firstName: 'Cy', lastName: 'Two' };

  it('1v1: single opponent name without with separator', () => {
    expect(getLeagueHomeOpponentRowDisplay([opp], undefined)).toEqual({
      kind: 'players',
      primary: 'B. One',
      partners: [],
    });
  });

  it('2v2: primary with partner list', () => {
    expect(getLeagueHomeOpponentRowDisplay([opp, opp2], undefined)).toEqual({
      kind: 'players',
      primary: 'B. One',
      partners: ['C. Two'],
    });
  });
});
