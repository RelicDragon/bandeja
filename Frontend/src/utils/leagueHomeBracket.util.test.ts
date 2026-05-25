import { describe, expect, it } from 'vitest';
import type { Game } from '@/types';
import {
  buildLeagueHomeGameBracketPath,
  buildLeagueHomeHubBracketPath,
  getLeagueHomeBracketRowContext,
  getLeagueHomeBracketUrgency,
  hubHasBracketLeagueGames,
  isBracketLeagueGame,
} from './leagueHomeBracket.util';

function leagueGame(partial: Partial<Game> & { id: string }): Game {
  return {
    entityType: 'LEAGUE',
    status: 'ANNOUNCED',
    startTime: '2026-01-01T12:00:00Z',
    endTime: '2026-01-01T14:00:00Z',
    participants: [],
    createdAt: '',
    updatedAt: '',
    ...partial,
  } as Game;
}

describe('leagueHomeBracket.util (UX-C1 / UX-C2 / UX-C8)', () => {
  it('detects bracket playoff games', () => {
    expect(
      isBracketLeagueGame(
        leagueGame({
          id: 'g1',
          parentId: 'season-1',
          leagueRound: { id: 'r1', orderIndex: 2, roundType: 'PLAYOFF', playoffFormat: 'BRACKET' },
        })
      )
    ).toBe(true);
    expect(
      isBracketLeagueGame(
        leagueGame({
          id: 'g2',
          parentId: 'season-1',
          leagueRound: { id: 'r2', orderIndex: 1, roundType: 'PLAYOFF', playoffFormat: 'WINNERS_COURT' },
        })
      )
    ).toBe(false);
  });

  it('builds schedule bracket deep link for per-group game', () => {
    const path = buildLeagueHomeGameBracketPath(
      leagueGame({
        id: 'g1',
        parentId: 'season-1',
        leagueGroupId: 'grp-a',
        leagueRound: {
          id: 'round-1',
          orderIndex: 1,
          roundType: 'PLAYOFF',
          playoffFormat: 'BRACKET',
          bracketScope: 'PER_GROUP',
        },
      })
    );
    expect(path).toBe(
      '/games/season-1?tab=schedule&subtab=bracket&roundId=round-1&round=round-1&group=grp-a'
    );
  });

  it('omits group for cross-group bracket games', () => {
    const path = buildLeagueHomeGameBracketPath(
      leagueGame({
        id: 'g1',
        parentId: 'season-1',
        leagueRound: {
          id: 'round-2',
          orderIndex: 3,
          roundType: 'PLAYOFF',
          playoffFormat: 'BRACKET',
          bracketScope: 'CROSS_GROUP',
        },
      })
    );
    expect(path).toBe('/games/season-1?tab=schedule&subtab=bracket&roundId=round-2&round=round-2');
    expect(path).not.toContain('group=');
  });

  it('hub helpers pick latest bracket round', () => {
    const games = [
      leagueGame({
        id: 'old',
        parentId: 'hub-1',
        leagueRound: { id: 'r-old', orderIndex: 0, roundType: 'PLAYOFF', playoffFormat: 'BRACKET' },
      }),
      leagueGame({
        id: 'new',
        parentId: 'hub-1',
        leagueRound: { id: 'r-new', orderIndex: 2, roundType: 'PLAYOFF', playoffFormat: 'BRACKET' },
      }),
    ];
    expect(hubHasBracketLeagueGames(games, 'hub-1')).toBe(true);
    expect(buildLeagueHomeHubBracketPath(games, 'hub-1')).toContain('roundId=r-new');
  });

  it('row context flags season playoff for cross-group', () => {
    expect(
      getLeagueHomeBracketRowContext(
        leagueGame({
          id: 'g1',
          parentId: 's1',
          leagueRound: {
            id: 'r1',
            orderIndex: 4,
            roundType: 'PLAYOFF',
            playoffFormat: 'BRACKET',
            bracketScope: 'CROSS_GROUP',
          },
        })
      )
    ).toEqual({
      isBracket: true,
      isSeasonPlayoff: true,
      roundIndex: 4,
      groupName: null,
      urgency: null,
    });
  });

  it('flags play-in urgency for unscheduled bracket games (UX-C10)', () => {
    expect(
      getLeagueHomeBracketUrgency(
        leagueGame({
          id: 'g1',
          parentId: 's1',
          leagueRound: { id: 'r1', orderIndex: 1, roundType: 'PLAYOFF', playoffFormat: 'BRACKET' },
          bracketSlot: { slotKind: 'PLAY_IN' },
        })
      )
    ).toBe('PLAY_IN');
    expect(
      getLeagueHomeBracketUrgency(
        leagueGame({
          id: 'g2',
          parentId: 's1',
          leagueRound: { id: 'r1', orderIndex: 1, roundType: 'PLAYOFF', playoffFormat: 'BRACKET' },
          bracketSlot: { slotKind: 'MAIN' },
        })
      )
    ).toBe('KNOCKOUT');
  });

  it('infers season playoff from missing group when scope absent (UX-C9)', () => {
    expect(
      getLeagueHomeBracketRowContext(
        leagueGame({
          id: 'g1',
          parentId: 's1',
          leagueRound: {
            id: 'r1',
            orderIndex: 2,
            roundType: 'PLAYOFF',
            playoffFormat: 'BRACKET',
          },
        })
      )?.isSeasonPlayoff
    ).toBe(true);
  });
});
