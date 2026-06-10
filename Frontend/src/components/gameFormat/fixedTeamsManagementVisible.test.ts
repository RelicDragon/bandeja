import { describe, expect, it } from 'vitest';
import { fixedTeamsManagementVisible } from './gameFormatTeamsVisibility';
import type { BasicUser, Game } from '@/types';

const user = { id: 'u1' } as BasicUser;

const baseGame = {
  resultsStatus: 'NONE',
  entityType: 'GAME',
  hasFixedTeams: true,
  maxParticipants: 4,
} as Game;

describe('fixedTeamsManagementVisible', () => {
  it('shows when all conditions met', () => {
    expect(fixedTeamsManagementVisible(baseGame, user)).toBe(true);
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
