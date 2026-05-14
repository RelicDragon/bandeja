import { describe, expect, it } from 'vitest';
import type { Game, GameParticipant } from '@/types';
import {
  getSortedTerminalInviteParticipants,
  isPendingGameInvite,
  isTerminalInviteStatus,
  mergeGameWithInviteDeletedPayload,
  participantBlocksInvitePlayerPicker,
  sortParticipantsForGameDetails,
} from './gameInviteParticipant';

function p(over: Partial<GameParticipant> & Pick<GameParticipant, 'userId' | 'status'>): GameParticipant {
  return {
    ...over,
    id: over.id ?? `id-${over.userId}`,
    role: over.role ?? 'PARTICIPANT',
    joinedAt: over.joinedAt ?? '2020-01-01T00:00:00.000Z',
  } as GameParticipant;
}

describe('gameInviteParticipant', () => {
  it('isTerminalInviteStatus', () => {
    expect(isTerminalInviteStatus('INVITE_DECLINED')).toBe(true);
    expect(isTerminalInviteStatus('INVITE_CANCELLED')).toBe(true);
    expect(isTerminalInviteStatus('INVITED')).toBe(false);
    expect(isTerminalInviteStatus('PLAYING')).toBe(false);
  });

  it('isPendingGameInvite', () => {
    expect(isPendingGameInvite({ status: 'INVITED' })).toBe(true);
    expect(isPendingGameInvite({ status: 'INVITE_DECLINED' })).toBe(false);
  });

  it('participantBlocksInvitePlayerPicker', () => {
    expect(participantBlocksInvitePlayerPicker({ status: 'INVITED' })).toBe(true);
    expect(participantBlocksInvitePlayerPicker({ status: 'PLAYING' })).toBe(true);
    expect(participantBlocksInvitePlayerPicker({ status: 'INVITE_DECLINED' })).toBe(false);
    expect(participantBlocksInvitePlayerPicker({ status: 'INVITE_CANCELLED' })).toBe(false);
  });

  it('sortParticipantsForGameDetails puts terminal invites last', () => {
    const a = p({ userId: 'u1', status: 'PLAYING' });
    const b = p({ userId: 'u2', status: 'INVITE_DECLINED', inviteClosedAt: '2020-01-02T00:00:00.000Z' });
    const c = p({ userId: 'u3', status: 'INVITE_CANCELLED', inviteClosedAt: '2020-01-03T00:00:00.000Z' });
    const sorted = sortParticipantsForGameDetails([b, a, c]);
    expect(sorted.map((x) => x.userId)).toEqual(['u1', 'u2', 'u3']);
  });

  it('getSortedTerminalInviteParticipants sorts by inviteClosedAt then joinedAt', () => {
    const later = p({
      userId: 'a',
      status: 'INVITE_DECLINED',
      inviteClosedAt: '2020-01-02T00:00:00.000Z',
      joinedAt: '2019-01-01T00:00:00.000Z',
    });
    const earlier = p({
      userId: 'b',
      status: 'INVITE_CANCELLED',
      inviteClosedAt: '2020-01-01T00:00:00.000Z',
      joinedAt: '2020-06-01T00:00:00.000Z',
    });
    const out = getSortedTerminalInviteParticipants([later, earlier]);
    expect(out.map((x) => x.userId)).toEqual(['b', 'a']);
  });

  it('mergeGameWithInviteDeletedPayload merges participantPatch by id', () => {
    const game: Game = {
      id: 'g1',
      participants: [p({ id: 'gp1', userId: 'u1', status: 'INVITED' })],
    } as Game;
    const next = mergeGameWithInviteDeletedPayload(game, {
      inviteId: 'gp1',
      gameId: 'g1',
      participantPatch: { id: 'gp1', userId: 'u1', status: 'INVITE_DECLINED', inviteClosedAt: '2020-01-01T00:00:00.000Z' },
    });
    expect(next.participants?.[0].status).toBe('INVITE_DECLINED');
    expect(next.participants?.[0].inviteClosedAt).toBe('2020-01-01T00:00:00.000Z');
  });

  it('mergeGameWithInviteDeletedPayload merges participantPatch by userId when id omitted', () => {
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

  it('mergeGameWithInviteDeletedPayload ignores wrong gameId', () => {
    const game: Game = { id: 'g1', participants: [p({ userId: 'u1', status: 'INVITED' })] } as Game;
    const next = mergeGameWithInviteDeletedPayload(game, {
      inviteId: 'x',
      gameId: 'other',
      participantPatch: { userId: 'u1', status: 'INVITE_DECLINED' },
    });
    expect(next.participants?.[0].status).toBe('INVITED');
  });

  it('mergeGameWithInviteDeletedPayload merges full participant', () => {
    const game: Game = { id: 'g1', participants: [p({ id: 'gp1', userId: 'u1', status: 'INVITED' })] } as Game;
    const incoming = p({ id: 'gp1', userId: 'u1', status: 'INVITE_CANCELLED', inviteClosedAt: '2020-01-01T00:00:00.000Z' });
    const next = mergeGameWithInviteDeletedPayload(game, {
      inviteId: 'gp1',
      gameId: 'g1',
      participant: incoming,
    });
    expect(next.participants?.[0].status).toBe('INVITE_CANCELLED');
  });
});
