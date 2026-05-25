import { describe, expect, it } from 'vitest';
import type { Game } from '@/types';
import {
  buildGameBracketReturnPath,
  resolveGameBracketReturnTarget,
} from './gameBracketReturn.util';

function leagueFixture(overrides: Partial<Game> = {}): Game {
  return {
    id: 'fixture-1',
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
    status: 'ANNOUNCED',
    resultsStatus: 'NONE',
    participants: [],
    parentId: 'season-1',
    leagueRoundId: 'round-bracket-1',
    leagueGroupId: 'group-a',
    parent: {
      id: 'season-1',
      leagueSeason: { id: 'season-1', leagueId: 'l1', league: { id: 'l1', name: 'League' } },
    },
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('gameBracketReturn.util (UX-D10)', () => {
  it('resolves bracket return target for league fixture games', () => {
    const target = resolveGameBracketReturnTarget(leagueFixture());
    expect(target).toEqual({
      leagueSeasonId: 'season-1',
      roundId: 'round-bracket-1',
      groupId: 'group-a',
    });
  });

  it('returns null for non-league games', () => {
    expect(resolveGameBracketReturnTarget(leagueFixture({ entityType: 'GAME' }))).toBeNull();
    expect(resolveGameBracketReturnTarget(leagueFixture({ leagueRoundId: undefined }))).toBeNull();
  });

  it('builds schedule bracket deep link', () => {
    const path = buildGameBracketReturnPath({
      leagueSeasonId: 'season-1',
      roundId: 'round-bracket-1',
      groupId: 'group-a',
    });
    expect(path).toBe(
      '/games/season-1?tab=schedule&subtab=bracket&roundId=round-bracket-1&round=round-bracket-1&group=group-a'
    );
  });
});
