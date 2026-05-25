import { describe, expect, it } from 'vitest';
import type { Game } from '@/types';
import {
  bracketMatchStatusFromGame,
  extractNonRallyOutcome,
  isBracketMatchComplete,
} from './leagueBracketMatchStatus';

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
    ...overrides,
  };
}

describe('leagueBracketMatchStatus.util (UX-D2)', () => {
  it('treats walkover, forfeit, and final as complete', () => {
    expect(isBracketMatchComplete('FINAL')).toBe(true);
    expect(isBracketMatchComplete('WALKOVER')).toBe(true);
    expect(isBracketMatchComplete('FORFEIT')).toBe(true);
    expect(isBracketMatchComplete('LIVE')).toBe(false);
  });

  it('detects non-rally outcome from match metadata', () => {
    const game = leagueGame({
      rounds: [
        {
          id: 'r1',
          matches: [
            {
              id: 'm1',
              teamA: [],
              teamB: [],
              sets: [],
              metadata: { nonRallyOutcome: 'DEFAULT' },
            },
          ],
        },
      ],
    });
    expect(extractNonRallyOutcome(game)).toBe('DEFAULT');
    expect(bracketMatchStatusFromGame(game)).toBe('FORFEIT');
  });

  it('detects walkover metadata', () => {
    const game = leagueGame({
      metadata: { nonRallyOutcome: 'WALKOVER' },
      rounds: [
        {
          id: 'r1',
          matches: [{ id: 'm1', teamA: [], teamB: [], sets: [{ teamA: 6, teamB: 4 }] }],
        },
      ],
    });
    expect(bracketMatchStatusFromGame(game)).toBe('WALKOVER');
  });

  it('treats final without scored sets as walkover', () => {
    const game = leagueGame({
      outcomes: [{ userId: 'u1', wins: 1, losses: 0 } as Game['outcomes'][0]],
      rounds: [
        {
          id: 'r1',
          matches: [{ id: 'm1', teamA: [], teamB: [], sets: [{ teamA: 0, teamB: 0 }] }],
        },
      ],
    });
    expect(bracketMatchStatusFromGame(game)).toBe('WALKOVER');
  });

  it('keeps played finals as FINAL when sets were scored', () => {
    const game = leagueGame({
      rounds: [
        {
          id: 'r1',
          matches: [{ id: 'm1', teamA: [], teamB: [], sets: [{ teamA: 6, teamB: 3 }] }],
        },
      ],
    });
    expect(bracketMatchStatusFromGame(game)).toBe('FINAL');
  });
});
