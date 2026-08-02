import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import type { Game } from '@/types';
import { liveBroadcastContext, liveBroadcastContextLabel } from './liveBroadcastContext.util';

const t = ((key: string, options?: { number?: number; round?: number }) => {
  const labels: Record<string, string> = {
    'gameDetails.bracketRoundFinal': 'finale',
    'gameDetails.bracketRoundSemifinals': 'polufinale',
    'gameDetails.bracketRoundQuarterfinals': 'četvrtfinale',
    'gameDetails.bracketRoundOf16': 'osmina finala',
    'gameDetails.bracketRoundOf32': 'šesnaestina finala',
    'gameDetails.bracketColumnMainRound': `Runda ${options?.round ?? ''}`,
    'gameDetails.bracketSeasonPlayoff': 'Plej-of',
  };
  if (key === 'gameResults.roundNumber') return `Runda ${options?.number}`;
  return labels[key] ?? key;
}) as TFunction;

function game(overrides: Partial<Game>): Game {
  return {
    id: 'game-1',
    entityType: 'GAME',
    gameType: 'CLASSIC',
    city: { id: 'city-1', name: 'Belgrade', country: 'RS' },
    startTime: '',
    endTime: '',
    maxParticipants: 4,
    minParticipants: 4,
    isPublic: true,
    affectsRating: true,
    allowDirectJoin: true,
    status: 'IN_PROGRESS',
    resultsStatus: 'IN_PROGRESS',
    participants: [],
    createdAt: '',
    updatedAt: '',
    ...overrides,
  } as Game;
}

describe('liveBroadcastContextLabel', () => {
  it('shows a game name and only includes game rounds after the first', () => {
    const regularGame = game({ name: 'Friday padel' });
    expect(liveBroadcastContextLabel(regularGame, 1, t)).toBe('Friday padel');
    expect(liveBroadcastContextLabel(regularGame, 2, t)).toBe('Friday padel · Runda 2');
  });

  it('always shows an available tournament round number', () => {
    const tournament = game({ entityType: 'TOURNAMENT', name: 'Summer Cup' });
    expect(liveBroadcastContextLabel(tournament, 1, t)).toBe('Summer Cup · Runda 1');
  });

  it('shows league, season, group, and compact regular round', () => {
    const leagueGame = game({
      entityType: 'LEAGUE',
      leagueGroup: { id: 'group-a', name: 'Group A' },
      leagueRound: { id: 'round-1', orderIndex: 2, roundType: 'REGULAR' },
      parent: {
        id: 'season-1',
        leagueSeason: {
          id: 'season-1',
          leagueId: 'league-1',
          league: { id: 'league-1', name: 'City League' },
          game: { id: 'season-1', name: 'Summer 2026' },
        },
      },
    });
    expect(liveBroadcastContextLabel(leagueGame, 1, t)).toBe(
      'City League · Summer 2026 · Group A · R3',
    );
  });

  it('localizes the league playoff stage, including brackets with a play-in', () => {
    const leagueGame = game({
      entityType: 'LEAGUE',
      leagueGroup: { id: 'group-a', name: 'Group A' },
      leagueRound: {
        id: 'round-1',
        orderIndex: 3,
        roundType: 'PLAYOFF',
        playoffFormat: 'BRACKET',
        entrantCount: 9,
        bracketSize: 16,
      },
      bracketSlot: { slotKind: 'MAIN', roundIndex: 0 },
      parent: {
        id: 'season-1',
        leagueSeason: {
          id: 'season-1',
          leagueId: 'league-1',
          league: { id: 'league-1', name: 'City League' },
          game: { id: 'season-1', name: 'Summer 2026' },
        },
      },
    });
    expect(liveBroadcastContextLabel(leagueGame, 1, t)).toBe(
      'City League · Summer 2026 · Group A · četvrtfinale',
    );
    expect(liveBroadcastContext(leagueGame, 1, t)).toEqual({
      title: 'City League',
      details: ['Summer 2026', 'Group A', 'četvrtfinale'],
    });
  });
});
