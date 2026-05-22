import { describe, expect, it } from 'vitest';
import type { GroupChannel } from '@/api/chat';
import type { BasicUser } from '@/types';
import { isUserGroupChannelParticipant, mergeGroupChannelFromApi } from './groupChannelParticipation';

function basicUser(id: string, firstName: string, lastName: string): BasicUser {
  return {
    id,
    firstName,
    lastName,
    level: 3,
    socialLevel: 3,
    gender: 'MALE',
    approvedLevel: false,
    isTrainer: false,
  };
}

function ch(over: Partial<GroupChannel> & Pick<GroupChannel, 'id'>): GroupChannel {
  return {
    name: 'Test',
    isChannel: false,
    isPublic: true,
    participantsCount: 1,
    createdAt: '',
    updatedAt: '',
    ...over,
  };
}

describe('mergeGroupChannelFromApi', () => {
  it('keeps isParticipant when stale API response arrives after join', () => {
    const prev = ch({ id: 'g1', isParticipant: true });
    const next = ch({ id: 'g1', isParticipant: false, name: 'Renamed' });
    const merged = mergeGroupChannelFromApi(prev, next);
    expect(merged.isParticipant).toBe(true);
    expect(merged.name).toBe('Renamed');
  });

  it('applies API data when not downgrading participant', () => {
    const prev = ch({ id: 'g1', isParticipant: false });
    const next = ch({ id: 'g1', isParticipant: true });
    expect(mergeGroupChannelFromApi(prev, next).isParticipant).toBe(true);
  });

  it('replaces when channel id differs', () => {
    const prev = ch({ id: 'g1', isParticipant: true });
    const next = ch({ id: 'g2', isParticipant: false });
    expect(mergeGroupChannelFromApi(prev, next).isParticipant).toBe(false);
  });
});

describe('isUserGroupChannelParticipant', () => {
  it('uses isParticipant flag', () => {
    expect(isUserGroupChannelParticipant(ch({ id: 'g1', isParticipant: true }), 'u1')).toBe(true);
  });

  it('uses participants list when flag is stale', () => {
    const group = ch({
      id: 'g1',
      isParticipant: false,
      participants: [
        {
          id: 'p1',
          groupChannelId: 'g1',
          userId: 'u1',
          role: 'PARTICIPANT',
          joinedAt: '',
          hidden: false,
          user: basicUser('u1', 'A', 'B'),
        },
      ],
    });
    expect(isUserGroupChannelParticipant(group, 'u1')).toBe(true);
    expect(isUserGroupChannelParticipant(group, 'u2')).toBe(false);
  });

  it('treats owner as participant', () => {
    const group = ch({
      id: 'g1',
      isParticipant: false,
      participants: [
        {
          id: 'p1',
          groupChannelId: 'g1',
          userId: 'u1',
          role: 'OWNER',
          joinedAt: '',
          hidden: false,
          user: basicUser('u1', 'A', 'B'),
        },
      ],
    });
    expect(isUserGroupChannelParticipant(group, 'u1')).toBe(true);
  });
});
