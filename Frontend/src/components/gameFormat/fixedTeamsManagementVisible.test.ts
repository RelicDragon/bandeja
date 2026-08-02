import { describe, expect, it } from 'vitest';
import {
  entitySupportsParticipantSetup,
  entitySupportsPlayersPerMatchControls,
  fixedTeamsManagementVisible,
  gameFormatFixedTeamsToggleVisible,
} from './gameFormatTeamsVisibility';
import type { BasicUser, Game } from '@/types';

const user = { id: 'u1' } as BasicUser;

const baseGame = {
  resultsStatus: 'NONE',
  entityType: 'GAME',
  hasFixedTeams: true,
  maxParticipants: 4,
  playersPerMatch: 4,
} as Game;

describe('entitySupportsPlayersPerMatchControls', () => {
  it('includes GAME, LEAGUE, TOURNAMENT', () => {
    expect(entitySupportsPlayersPerMatchControls('GAME')).toBe(true);
    expect(entitySupportsPlayersPerMatchControls('LEAGUE')).toBe(true);
    expect(entitySupportsPlayersPerMatchControls('TOURNAMENT')).toBe(true);
  });

  it('excludes TRAINING and BAR', () => {
    expect(entitySupportsPlayersPerMatchControls('TRAINING')).toBe(false);
    expect(entitySupportsPlayersPerMatchControls('BAR')).toBe(false);
  });
});

describe('entitySupportsParticipantSetup', () => {
  it.each(['GAME', 'TRAINING', 'TOURNAMENT', 'LEAGUE', 'LEAGUE_SEASON'] as const)(
    'supports %s participant setup',
    (entityType) => {
      expect(entitySupportsParticipantSetup(entityType)).toBe(true);
    },
  );

  it('excludes open BAR lobbies', () => {
    expect(entitySupportsParticipantSetup('BAR')).toBe(false);
  });
});

describe('gameFormatFixedTeamsToggleVisible', () => {
  it('shows for tournament even roster >= 4', () => {
    expect(gameFormatFixedTeamsToggleVisible('TOURNAMENT', 8)).toBe(true);
  });

  it('hides for odd roster and singles-sized roster', () => {
    expect(gameFormatFixedTeamsToggleVisible('TOURNAMENT', 5)).toBe(false);
    expect(gameFormatFixedTeamsToggleVisible('GAME', 2)).toBe(false);
  });

  it('hides for TRAINING and BAR', () => {
    expect(gameFormatFixedTeamsToggleVisible('TRAINING', 8)).toBe(false);
    expect(gameFormatFixedTeamsToggleVisible('BAR', 8)).toBe(false);
  });
});

describe('fixedTeamsManagementVisible', () => {
  it('shows when all conditions met', () => {
    expect(fixedTeamsManagementVisible(baseGame, user)).toBe(true);
  });

  it('shows for tournament with fixed pairs', () => {
    expect(
      fixedTeamsManagementVisible(
        { ...baseGame, entityType: 'TOURNAMENT', maxParticipants: 8 },
        user,
      ),
    ).toBe(true);
  });

  it('hides when singles playersPerMatch', () => {
    expect(
      fixedTeamsManagementVisible({ ...baseGame, playersPerMatch: 2 }, user),
    ).toBe(false);
  });

  it('hides without user', () => {
    expect(fixedTeamsManagementVisible(baseGame, null)).toBe(false);
  });

  it('hides when hasFixedTeams false', () => {
    expect(fixedTeamsManagementVisible({ ...baseGame, hasFixedTeams: false }, user)).toBe(false);
  });

  it('hides when results started', () => {
    expect(fixedTeamsManagementVisible({ ...baseGame, resultsStatus: 'IN_PROGRESS' }, user)).toBe(false);
  });

  it('hides for BAR and TRAINING', () => {
    expect(fixedTeamsManagementVisible({ ...baseGame, entityType: 'BAR' }, user)).toBe(false);
    expect(fixedTeamsManagementVisible({ ...baseGame, entityType: 'TRAINING' }, user)).toBe(false);
  });

  it('hides for invalid roster sizes', () => {
    expect(fixedTeamsManagementVisible({ ...baseGame, maxParticipants: 2 }, user)).toBe(false);
    expect(fixedTeamsManagementVisible({ ...baseGame, maxParticipants: 3 }, user)).toBe(false);
    expect(fixedTeamsManagementVisible({ ...baseGame, maxParticipants: 5 }, user)).toBe(false);
  });
});
