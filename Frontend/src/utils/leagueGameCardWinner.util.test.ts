import { describe, expect, it } from 'vitest';
import type { Game } from '@/types';
import { resolveLeagueGameCardWinner } from './leagueGameCardWinner.util';

function leagueGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'g1',
    entityType: 'LEAGUE',
    gameType: 'CLASSIC',
    city: { id: 'c1', name: 'City' } as Game['city'],
    startTime: '',
    endTime: '',
    maxParticipants: 4,
    minParticipants: 4,
    isPublic: false,
    affectsRating: false,
    allowDirectJoin: false,
    status: 'FINISHED',
    resultsStatus: 'FINAL',
    participants: [],
    createdAt: '',
    updatedAt: '',
    fixedTeams: [
      {
        teamNumber: 1,
        players: [{ user: { id: 'u1' } }],
      },
      {
        teamNumber: 2,
        players: [{ user: { id: 'u2' } }],
      },
    ] as Game['fixedTeams'],
    ...overrides,
  };
}

describe('resolveLeagueGameCardWinner', () => {
  it('uses outcomes when present', () => {
    const game = leagueGame({
      outcomes: [
        {
          userId: 'u1',
          user: { id: 'u1' },
          wins: 1,
          losses: 0,
        },
        {
          userId: 'u2',
          user: { id: 'u2' },
          wins: 0,
          losses: 1,
        },
      ] as Game['outcomes'],
    });
    expect(resolveLeagueGameCardWinner(game).winner).toBe('teamA');
  });

  it('falls back to fetched result rounds when outcomes missing', () => {
    const game = leagueGame({ outcomes: undefined });
    expect(
      resolveLeagueGameCardWinner(game, [
        {
          roundNumber: 1,
          matches: [
            {
              matchNumber: 1,
              teams: [],
              sets: [{ setNumber: 1, teamAScore: 9, teamBScore: 0 }],
            },
          ],
        },
      ]).winner
    ).toBe('teamA');
  });
});
