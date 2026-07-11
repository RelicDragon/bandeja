import { describe, expect, it } from 'vitest';
import { gameCardReactionsEqual } from './gameCardReactionsEqual';
import { getPlayingParticipants, playingParticipantsKey } from './gameCardParticipants';
import type { GameParticipant } from '@/types';

describe('gameCardReactionsEqual', () => {
  it('treats identical reaction rows as equal', () => {
    const rows = [{ userId: 'u1', emoji: '❤️' }];
    expect(gameCardReactionsEqual(rows, rows)).toBe(true);
    expect(gameCardReactionsEqual(rows, [{ userId: 'u1', emoji: '❤️' }])).toBe(true);
  });

  it('detects emoji or user changes', () => {
    const a = [{ userId: 'u1', emoji: '❤️' }];
    expect(gameCardReactionsEqual(a, [{ userId: 'u1', emoji: '🔥' }])).toBe(false);
    expect(gameCardReactionsEqual(a, [{ userId: 'u2', emoji: '❤️' }])).toBe(false);
  });
});

describe('playingParticipantsKey', () => {
  const base = {
    userId: 'u1',
    role: 'PLAYER',
    status: 'PLAYING',
    user: { id: 'u1', firstName: 'Ada', lastName: 'Lovelace', avatar: 'a.png' },
  } as GameParticipant;

  it('filters playing participants', () => {
    const list = [
      base,
      { ...base, userId: 'u2', status: 'INVITED' } as GameParticipant,
    ];
    expect(getPlayingParticipants(list)).toHaveLength(1);
    expect(getPlayingParticipants(list)[0]?.userId).toBe('u1');
  });

  it('changes key when avatar updates', () => {
    const before = playingParticipantsKey([base]);
    const after = playingParticipantsKey([
      { ...base, user: { ...base.user!, avatar: 'b.png' } } as GameParticipant,
    ]);
    expect(before).not.toBe(after);
  });
});
