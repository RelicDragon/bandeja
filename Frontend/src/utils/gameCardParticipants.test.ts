import { describe, expect, it } from 'vitest';
import {
  getPlayingParticipants,
  participantsLayoutKey,
  participantsRenderKey,
  playingParticipantsKey,
} from './gameCardParticipants';
import type { GameParticipant } from '@/types';

const playing = {
  userId: 'u1',
  role: 'PLAYER',
  status: 'PLAYING',
  user: { id: 'u1', firstName: 'A', lastName: 'B', avatar: 'a.png' },
} as GameParticipant;

describe('participantsRenderKey', () => {
  it('differs when a non-playing participant is invited', () => {
    const invited = { ...playing, userId: 'u2', status: 'INVITED' } as GameParticipant;
    const before = participantsRenderKey([playing, invited]);
    const after = participantsRenderKey([
      playing,
      { ...invited, status: 'PLAYING' } as GameParticipant,
    ]);
    expect(before).not.toBe(after);
  });
});

describe('participantsLayoutKey', () => {
  it('is stable for the same ids in the same order', () => {
    const list = [playing, { ...playing, userId: 'u2' } as GameParticipant];
    expect(participantsLayoutKey(list)).toBe(participantsLayoutKey([...list]));
  });
});

describe('getPlayingParticipants', () => {
  it('excludes non-playing statuses', () => {
    const list = [
      playing,
      { ...playing, userId: 'u2', status: 'IN_QUEUE' } as GameParticipant,
    ];
    expect(getPlayingParticipants(list)).toHaveLength(1);
    expect(getPlayingParticipants(list)[0]?.userId).toBe('u1');
  });

  it('changes playing key when a playing avatar updates', () => {
    const before = playingParticipantsKey([playing]);
    const after = playingParticipantsKey([
      { ...playing, user: { ...playing.user!, avatar: 'b.png' } } as GameParticipant,
    ]);
    expect(before).not.toBe(after);
  });
});
