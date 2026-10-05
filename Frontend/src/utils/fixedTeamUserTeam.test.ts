import { describe, expect, it } from 'vitest';
import type { BasicUser, FixedTeamUserTeam, GameTeam } from '@/types';
import {
  avatarTeamFromFixedTeam,
  carryFixedTeamUserTeams,
  fixedTeamDisplayName,
  userTeamForRoster,
} from './fixedTeamUserTeam';

const user = (id: string): BasicUser => ({ id, firstName: id.toUpperCase(), lastName: null }) as unknown as BasicUser;

const ut = (over: Partial<FixedTeamUserTeam> = {}): FixedTeamUserTeam => ({
  id: 'ut1',
  name: 'Smash Bros',
  avatar: null,
  cutAngle: 60,
  color: 'coral',
  ownerId: 'b',
  ...over,
});

const team = (n: number, ids: string[], over: Partial<GameTeam> = {}): GameTeam => ({
  id: `gt${n}`,
  gameId: 'g1',
  teamNumber: n,
  players: ids.map((id) => ({ id: `p-${id}`, gameTeamId: `gt${n}`, userId: id, user: user(id) })),
  ...over,
});

describe('userTeamForRoster', () => {
  const teams = [team(1, ['a', 'b'], { userTeam: ut() }), team(2, ['c', 'd'], { userTeam: null })];

  it('finds the user team of the fixed team with exactly these players, any order', () => {
    expect(userTeamForRoster(teams, ['b', 'a'])?.id).toBe('ut1');
  });

  it('is null for a side that is not a fixed team with a user team', () => {
    expect(userTeamForRoster(teams, ['c', 'd'])).toBeNull();
    expect(userTeamForRoster(teams, ['a', 'c'])).toBeNull();
    expect(userTeamForRoster(teams, ['a'])).toBeNull();
    expect(userTeamForRoster(teams, ['a', 'b', 'c'])).toBeNull();
    expect(userTeamForRoster(undefined, ['a', 'b'])).toBeNull();
  });
});

describe('fixedTeamDisplayName', () => {
  it('prefers the live user-team name over the stored fixture name', () => {
    expect(fixedTeamDisplayName({ name: 'Old name', userTeam: ut({ name: 'New name' }) })).toBe('New name');
  });

  it('falls back to the fixture name, then null', () => {
    expect(fixedTeamDisplayName({ name: ' Lobbers ', userTeam: null })).toBe('Lobbers');
    expect(fixedTeamDisplayName({ name: '  ', userTeam: undefined })).toBeNull();
    expect(fixedTeamDisplayName(undefined)).toBeNull();
  });
});

describe('carryFixedTeamUserTeams', () => {
  const prev = [team(1, ['a', 'b'], { userTeam: ut() }), team(2, ['c', 'd'], { userTeam: null })];

  it('keeps the known user team when the payload has no userTeam key and the roster is unchanged', () => {
    const next = [team(1, ['b', 'a']), team(2, ['c', 'd'])];
    const out = carryFixedTeamUserTeams(prev, next)!;
    expect(out[0].userTeam?.id).toBe('ut1');
    expect('userTeam' in out[1]).toBe(false);
  });

  it('drops it when the roster changed', () => {
    const next = [team(1, ['a', 'c']), team(2, ['b', 'd'])];
    expect(carryFixedTeamUserTeams(prev, next)).toBe(next);
  });

  it('lets an explicit server value win', () => {
    const next = [team(1, ['a', 'b'], { userTeam: null })];
    expect(carryFixedTeamUserTeams(prev, next)![0].userTeam).toBeNull();
  });

  it('returns the same array when nothing to carry', () => {
    const next = [team(1, ['a', 'b'])];
    expect(carryFixedTeamUserTeams([], next)).toBe(next);
    expect(carryFixedTeamUserTeams(prev, undefined)).toBeUndefined();
  });
});

describe('avatarTeamFromFixedTeam', () => {
  it('puts the owner first and the partner as the accepted member', () => {
    const t = avatarTeamFromFixedTeam(ut({ ownerId: 'b' }), [user('a'), user('b')])!;
    expect(t.owner.id).toBe('b');
    expect(t.members.map((m) => [m.userId, m.status])).toEqual([['a', 'ACCEPTED']]);
    expect(t.cutAngle).toBe(60);
    expect(t.color).toBe('coral');
  });

  it('falls back to the first player when the owner id is missing (older server)', () => {
    const t = avatarTeamFromFixedTeam(ut({ ownerId: undefined }), [user('a'), user('b')])!;
    expect(t.owner.id).toBe('a');
    expect(t.members[0].userId).toBe('b');
  });

  it('is null without players', () => {
    expect(avatarTeamFromFixedTeam(ut(), [])).toBeNull();
  });
});
