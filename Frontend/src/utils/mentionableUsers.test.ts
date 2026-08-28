import { describe, expect, it } from 'vitest';
import {
  buildGameMentionableUsers,
  buildGroupMentionableUsers,
} from '@/utils/mentionableUsers';
import type { GameParticipant } from '@/types';

function gp(
  userId: string,
  status: GameParticipant['status'] = 'PLAYING',
  role: GameParticipant['role'] = 'PARTICIPANT'
): GameParticipant {
  return {
    id: `gp-${userId}`,
    userId,
    gameId: 'game-1',
    status,
    role,
    user: { id: userId, firstName: userId, lastName: 'Test' },
  };
}

describe('buildGameMentionableUsers', () => {
  it('includes all participants in PUBLIC chat', () => {
    const users = buildGameMentionableUsers(
      [gp('a'), gp('b', 'IN_QUEUE')],
      undefined,
      'PUBLIC'
    );
    expect(users).toHaveLength(2);
  });

  it('includes only PLAYING participants in PRIVATE chat', () => {
    const users = buildGameMentionableUsers(
      [gp('playing'), gp('queue', 'IN_QUEUE')],
      undefined,
      'PRIVATE'
    );
    expect(users).toHaveLength(1);
    expect(users[0]?.id).toBe('playing');
  });

  it('includes admins and owners in ADMINS chat', () => {
    const users = buildGameMentionableUsers(
      [gp('player'), gp('admin', 'PLAYING', 'ADMIN')],
      undefined,
      'ADMINS'
    );
    expect(users).toHaveLength(1);
    expect(users[0]?.id).toBe('admin');
  });
});

describe('buildGroupMentionableUsers', () => {
  it('dedupes participants by user id', () => {
    const users = buildGroupMentionableUsers([
      { id: 'p1', userId: 'u1', user: { id: 'u1', firstName: 'A', lastName: 'B' } },
      { id: 'p2', userId: 'u1', user: { id: 'u1', firstName: 'A', lastName: 'B' } },
    ]);
    expect(users).toHaveLength(1);
  });
});
