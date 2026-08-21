import { describe, expect, it } from 'vitest';
import { visibleMatchingGames, matchingGamesKey, matchingGamesOrbitKey } from './matchingLobbyGames';
import type { MatchingLobbyGame } from '@/api/playIntents';

const game: MatchingLobbyGame = {
  id: 'g1',
  entityType: 'GAME',
  allowDirectJoin: true,
  genderTeams: 'ANY',
  startTime: '2026-08-21T16:00:00.000Z',
  timeLabel: '18:00',
  club: { id: 'c1', name: 'Club' },
  maxParticipants: 4,
  playingCount: 2,
  playingAvatars: [],
  ownerAvatar: null,
};

describe('visibleMatchingGames', () => {
  it('hides games for spectators and open proposals', () => {
    expect(visibleMatchingGames([game], { looking: false, hasProposal: false })).toEqual([]);
    expect(visibleMatchingGames([game], { looking: true, hasProposal: true })).toEqual([]);
  });

  it('shows games while looking without a proposal', () => {
    expect(visibleMatchingGames([game], { looking: true, hasProposal: false })).toEqual([game]);
    expect(visibleMatchingGames(undefined, { looking: true, hasProposal: false })).toEqual([]);
  });

  it('keeps games visible in the direct match editor (no real proposal)', () => {
    expect(visibleMatchingGames([game], { looking: true, hasProposal: false })).toEqual([game]);
  });

  it('keys games by join mode and occupancy', () => {
    expect(matchingGamesKey([game])).toBe('g1:1:2:4:18:00:GAME');
    expect(matchingGamesKey([{ ...game, allowDirectJoin: false }])).toBe(
      'g1:0:2:4:18:00:GAME',
    );
  });

  it('keeps orbit identity stable when occupancy changes', () => {
    expect(matchingGamesOrbitKey([game])).toBe('g1');
    expect(matchingGamesOrbitKey([{ ...game, playingCount: 3 }])).toBe('g1');
  });
});
