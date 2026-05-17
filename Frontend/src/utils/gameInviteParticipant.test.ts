import { describe, expect, it } from 'vitest';
import type { Game, GameInviteOutcome, GameParticipant } from '@/types';
import {
  getSortedInviteOutcomes,
  isPendingGameInvite,
  mergeGameWithInviteDeletedPayload,
  participantBlocksInvitePlayerPicker,
} from './gameInviteParticipant';

function p(over: Partial<GameParticipant> & Pick<GameParticipant, 'userId' | 'status'>): GameParticipant {
  return {
    ...over,
    id: over.id ?? `id-${over.userId}`,
    role: over.role ?? 'PARTICIPANT',
    joinedAt: over.joinedAt ?? '2020-01-01T00:00:00.000Z',
  } as GameParticipant;
}

function outcome(over: Partial<GameInviteOutcome> & Pick<GameInviteOutcome, 'userId' | 'outcome'>): GameInviteOutcome {
  return {
    id: over.id ?? `o-${over.userId}`,
    gameId: over.gameId ?? 'g1',
    closedAt: over.closedAt ?? '2020-01-01T00:00:00.000Z',
    user: over.user ?? ({ id: over.userId } as GameInviteOutcome['user']),
    ...over,
  } as GameInviteOutcome;
}

describe('gameInviteParticipant', () => {
  it('isPendingGameInvite', () => {
    expect(isPendingGameInvite({ status: 'INVITED' })).toBe(true);
    expect(isPendingGameInvite({ status: 'PLAYING' })).toBe(false);
  });

  it('participantBlocksInvitePlayerPicker', () => {
    expect(participantBlocksInvitePlayerPicker({ status: 'INVITED' })).toBe(true);
    expect(participantBlocksInvitePlayerPicker({ status: 'PLAYING' })).toBe(true);
  });

  it('getSortedInviteOutcomes sorts by closedAt', () => {
    const later = outcome({ userId: 'a', outcome: 'DECLINED', closedAt: '2020-01-02T00:00:00.000Z' });
    const earlier = outcome({ userId: 'b', outcome: 'CANCELLED', closedAt: '2020-01-01T00:00:00.000Z' });
    expect(getSortedInviteOutcomes([later, earlier]).map((x) => x.userId)).toEqual(['b', 'a']);
  });

  it('mergeGameWithInviteDeletedPayload removes participant and adds inviteOutcome', () => {
    const game: Game = {
      id: 'g1',
      participants: [p({ id: 'gp1', userId: 'u1', status: 'INVITED' })],
      inviteOutcomes: [],
    } as Game;
    const next = mergeGameWithInviteDeletedPayload(game, {
      inviteId: 'gp1',
      gameId: 'g1',
      removedParticipantId: 'gp1',
      removedUserId: 'u1',
      inviteOutcome: {
        userId: 'u1',
        outcome: 'DECLINED',
        closedAt: '2020-01-01T00:00:00.000Z',
        invitedByUserId: null,
      },
    });
    expect(next.participants).toHaveLength(0);
    expect(next.inviteOutcomes?.[0].outcome).toBe('DECLINED');
  });

  it('mergeGameWithInviteDeletedPayload merges participantPatch by userId', () => {
    const game: Game = {
      id: 'g1',
      participants: [p({ id: 'gp1', userId: 'u1', status: 'INVITED' })],
    } as Game;
    const next = mergeGameWithInviteDeletedPayload(game, {
      inviteId: 'gp1',
      gameId: 'g1',
      participantPatch: { userId: 'u1', status: 'IN_QUEUE', inviteClosedAt: null },
    });
    expect(next.participants?.[0].status).toBe('IN_QUEUE');
  });
});
