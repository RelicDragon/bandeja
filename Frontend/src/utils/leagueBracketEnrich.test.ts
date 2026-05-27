import { describe, expect, it } from 'vitest';
import type { BracketPlayoffGroupDto } from '@/api/leagues';
import type { Game } from '@/types';
import { enrichBracketGroups } from './leagueBracketEnrich';

function leagueGame(id: string, extras: Partial<Game> = {}): Game {
  return {
    id,
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
      { teamNumber: 1, players: [] },
      { teamNumber: 2, players: [] },
    ] as Game['fixedTeams'],
    ...extras,
  };
}

describe('enrichBracketGroups', () => {
  it('replaces bracket API game stub with league round game (outcomes)', () => {
    const groups: BracketPlayoffGroupDto[] = [
      {
        leagueGroupId: 'g1',
        entrantCount: 4,
        bracketSize: 4,
        byeCount: 0,
        playInGameCount: 0,
        slots: [
          {
            id: 's1',
            slotKey: 'MAIN-R0-M0',
            slotKind: 'MAIN',
            phaseIndex: 0,
            roundIndex: 0,
            matchIndex: 0,
            gameId: 'game-1',
            game: leagueGame('game-1'),
          },
        ],
      },
    ];
    const roundGame = leagueGame('game-1', {
      outcomes: [
        {
          id: 'o1',
          gameId: 'game-1',
          userId: 'u1',
          wins: 1,
          losses: 0,
          ties: 0,
        } as Game['outcomes'][0],
      ],
    });

    const enriched = enrichBracketGroups(groups, [roundGame]);
    expect(enriched[0].slots[0].game).toBe(roundGame);
    expect(enriched[0].slots[0].game?.outcomes).toHaveLength(1);
  });
});
