import { describe, expect, it } from 'vitest';
import { resolveFixedTeamPlayerUser } from './resolveFixedTeamPlayerUser';
import type { BasicUser, Game } from '@/types';

const projectedUser = (id: string, level: number): BasicUser => ({
  id,
  firstName: 'Test',
  lastName: id,
  level,
});

const staleUser = (id: string, level: number): BasicUser => ({
  id,
  firstName: 'Stale',
  lastName: id,
  level,
});

const gameWithParticipants = (participants: Game['participants']): Game =>
  ({
    participants,
  }) as Game;

describe('resolveFixedTeamPlayerUser', () => {
  it('prefers participant user with sport-projected level over stale fixed-team embed', () => {
    const userId = 'u1';
    const game = gameWithParticipants([
      {
        userId,
        status: 'PLAYING',
        user: projectedUser(userId, 2.2),
      } as Game['participants'][number],
    ]);

    expect(resolveFixedTeamPlayerUser(game, userId, staleUser(userId, 1.6))).toEqual(
      projectedUser(userId, 2.2),
    );
  });

  it('falls back when participant is missing', () => {
    const fallback = staleUser('u2', 1.8);
    const game = gameWithParticipants([]);

    expect(resolveFixedTeamPlayerUser(game, 'u2', fallback)).toBe(fallback);
  });
});
