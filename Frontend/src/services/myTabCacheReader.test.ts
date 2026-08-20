import { describe, expect, it } from 'vitest';
import type { Invite, UserTeam } from '@/types';
import {
  countPendingInvites,
  hasMyTabMembershipsSnapshot,
  ownedTeamsFromMyTab,
} from '@/services/myTabCacheReader';

describe('myTabCacheReader', () => {
  it('counts only pending invites', () => {
    const invites = [
      { id: '1', status: 'PENDING' },
      { id: '2', status: 'ACCEPTED' },
      { id: '3', status: 'PENDING' },
    ] as Invite[];

    expect(countPendingInvites(invites)).toBe(2);
  });

  it('does not count pending invites whose playing roster is full', () => {
    const invites = [
      {
        id: '1',
        status: 'PENDING',
        game: {
          maxParticipants: 4,
          participants: [
            { status: 'PLAYING' },
            { status: 'PLAYING' },
            { status: 'PLAYING' },
            { status: 'PLAYING' },
          ],
        },
      },
      {
        id: '2',
        status: 'PENDING',
        game: {
          maxParticipants: 4,
          participants: [{ status: 'PLAYING' }],
        },
      },
    ] as Invite[];

    expect(countPendingInvites(invites)).toBe(1);
  });

  it('does not count MIX_PAIRS invites whose invitee gender bucket is full', () => {
    const invites = [
      {
        id: '1',
        status: 'PENDING',
        receiver: { gender: 'MALE' },
        game: {
          maxParticipants: 4,
          genderTeams: 'MIX_PAIRS',
          participants: [
            { status: 'PLAYING', user: { gender: 'MALE' } },
            { status: 'PLAYING', user: { gender: 'MALE' } },
            { status: 'PLAYING', user: { gender: 'FEMALE' } },
          ],
        },
      },
      {
        id: '2',
        status: 'PENDING',
        receiver: { gender: 'FEMALE' },
        game: {
          maxParticipants: 4,
          genderTeams: 'MIX_PAIRS',
          participants: [
            { status: 'PLAYING', user: { gender: 'MALE' } },
            { status: 'PLAYING', user: { gender: 'MALE' } },
            { status: 'PLAYING', user: { gender: 'FEMALE' } },
          ],
        },
      },
    ] as Invite[];

    expect(countPendingInvites(invites)).toBe(1);
  });

  it('extracts owned teams from my-tab teams payload', () => {
    const teams = [
      { id: 't1', ownerId: 'user-1' },
      { id: 't2', ownerId: 'user-2' },
    ] as UserTeam[];

    expect(ownedTeamsFromMyTab(teams, 'user-1').map((team) => team.id)).toEqual(['t1']);
  });

  it('distinguishes missing memberships from an empty memberships snapshot', () => {
    expect(hasMyTabMembershipsSnapshot(undefined)).toBe(false);
    expect(hasMyTabMembershipsSnapshot({ memberships: undefined })).toBe(false);
    expect(hasMyTabMembershipsSnapshot({ memberships: null })).toBe(false);
    expect(hasMyTabMembershipsSnapshot({ memberships: [] })).toBe(true);
  });
});
