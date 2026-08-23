import { describe, expect, it } from 'vitest';
import type { Game, GameParticipant } from '@/types';
import {
  excludePendingInviteOnlyMyGames,
  isPendingInviteOnlyMyGame,
} from './excludePendingInviteOnlyMyGames';

function p(userId: string, status: GameParticipant['status']): GameParticipant {
  return { id: `id-${userId}`, userId, status, role: 'PARTICIPANT' } as GameParticipant;
}

function g(id: string, participants: GameParticipant[]): Game {
  return { id, participants } as Game;
}

describe('excludePendingInviteOnlyMyGames', () => {
  it('treats INVITED-only membership as invite-only', () => {
    expect(isPendingInviteOnlyMyGame(g('g1', [p('u1', 'INVITED')]), 'u1')).toBe(true);
  });

  it('keeps playing, queue, and guest membership', () => {
    expect(isPendingInviteOnlyMyGame(g('g1', [p('u1', 'PLAYING')]), 'u1')).toBe(false);
    expect(isPendingInviteOnlyMyGame(g('g1', [p('u1', 'IN_QUEUE')]), 'u1')).toBe(false);
    expect(isPendingInviteOnlyMyGame(g('g1', [p('u1', 'GUEST')]), 'u1')).toBe(false);
  });

  it('drops invite-only games from My games and keeps others', () => {
    const games = [
      g('invited', [p('u1', 'INVITED')]),
      g('playing', [p('u1', 'PLAYING')]),
      g('other', [p('u2', 'INVITED')]),
    ];
    expect(excludePendingInviteOnlyMyGames(games, 'u1').map((game) => game.id)).toEqual([
      'playing',
      'other',
    ]);
  });

  it('keeps games without the viewer participant row', () => {
    const games = [g('unknown', [])];
    expect(excludePendingInviteOnlyMyGames(games, 'u1')).toEqual(games);
  });
});
