import { describe, expect, it } from 'vitest';
import type { PairMember } from '@/api/pairs';
import type { BasicUser } from '@/types';
import { buildRivalryRematchState } from './rivalryRematch';

const basic = (id: string): BasicUser => ({
  id,
  firstName: id,
  level: 3,
  socialLevel: 0,
  gender: 'MALE',
  approvedLevel: true,
  isTrainer: false,
});

const member = (id: string): PairMember => ({
  id,
  firstName: id.toUpperCase(),
  lastName: null,
  avatar: null,
  isPremium: false,
  showPremiumStatus: false,
  level: null,
});

describe('buildRivalryRematchState', () => {
  it('invites the partner and both opponents, never the viewer', () => {
    const state = buildRivalryRematchState({
      viewerId: 'me',
      teamMembers: [basic('me'), basic('partner')],
      rivalry: { userA: member('c'), userB: member('d') },
    });
    expect(state.entityType).toBe('GAME');
    expect(state.invitedPlayerIds).toEqual(['partner', 'c', 'd']);
    expect(state.invitedPlayers.map((u) => u.id)).toEqual(['partner', 'c', 'd']);
    expect(state.invitedPlayers[1]?.firstName).toBe('C');
  });

  it('keeps the team copy of a player and drops duplicates', () => {
    const state = buildRivalryRematchState({
      viewerId: 'partner',
      teamMembers: [basic('owner'), basic('partner')],
      rivalry: { userA: member('owner'), userB: member('d') },
    });
    expect(state.invitedPlayerIds).toEqual(['owner', 'd']);
    expect(state.invitedPlayers[0]?.approvedLevel).toBe(true);
  });
});
