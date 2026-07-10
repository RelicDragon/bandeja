import { describe, expect, it } from 'vitest';
import type { BasicUser } from '@/types';
import {
  gameRosterFromMatchFormat,
  maxSlotsForUserTournament,
  tournamentParticipantOptions,
} from './userMaxParticipantsInGame';

const baseUser = (overrides: Partial<BasicUser> = {}): BasicUser =>
  ({
    id: 'u1',
    isAdmin: false,
    canCreateTournament: false,
    maxParticipantsInGame: 12,
    ...overrides,
  }) as BasicUser;

describe('gameRosterFromMatchFormat', () => {
  it('maps 1v1 to 2 and 2v2 to 4', () => {
    expect(gameRosterFromMatchFormat(2)).toBe(2);
    expect(gameRosterFromMatchFormat(4)).toBe(4);
  });
});

describe('tournament caps', () => {
  it('offers 8–12 for normal users', () => {
    expect(tournamentParticipantOptions(baseUser())).toEqual([8, 10, 12]);
    expect(maxSlotsForUserTournament(baseUser())).toBe(12);
  });

  it('offers up to 32 for canCreateTournament users', () => {
    const user = baseUser({ canCreateTournament: true });
    expect(maxSlotsForUserTournament(user)).toBe(32);
    expect(tournamentParticipantOptions(user)).toEqual([
      8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32,
    ]);
  });

  it('offers up to 32 for admins', () => {
    expect(maxSlotsForUserTournament(baseUser({ isAdmin: true }))).toBe(32);
  });
});
