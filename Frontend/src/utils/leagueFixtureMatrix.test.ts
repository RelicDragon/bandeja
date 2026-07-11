import { describe, expect, it } from 'vitest';
import type { Game } from '@/types';
import { buildPairCellMap, gameHasFixturePairTeams } from './leagueFixtureMatrix';

function leagueGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'game-1',
    entityType: 'LEAGUE',
    leagueGroupId: 'group-a',
    hasFixedTeams: false,
    fixedTeams: [
      {
        teamNumber: 1,
        players: [{ userId: 'u1' }, { userId: 'u2' }],
      },
      {
        teamNumber: 2,
        players: [{ userId: 'u3' }, { userId: 'u4' }],
      },
    ],
    ...overrides,
  } as Game;
}

describe('gameHasFixturePairTeams', () => {
  it('returns true when two full fixed teams exist even if hasFixedTeams is false', () => {
    expect(gameHasFixturePairTeams(leagueGame())).toBe(true);
  });

  it('returns false when fixed teams are missing', () => {
    expect(gameHasFixturePairTeams(leagueGame({ fixedTeams: [] }))).toBe(false);
  });
});

describe('buildPairCellMap', () => {
  it('includes games with pair teams when hasFixedTeams flag is false', () => {
    const map = buildPairCellMap(
      [
        {
          roundType: 'REGULAR',
          games: [leagueGame()],
        },
      ] as Parameters<typeof buildPairCellMap>[0],
      'group-a',
    );

    expect(map.size).toBe(1);
    expect(map.get('u1,u2|u3,u4')?.[0]?.id).toBe('game-1');
  });
});
