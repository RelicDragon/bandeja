import { describe, expect, it } from 'vitest';
import type { GameOutcome, GameParticipant } from '@/types';
import {
  gameCardOutcomesKey,
  hasOutcomeStandings,
  orderPlayingParticipantsByStandings,
  placeMapsEqual,
} from '@/utils/gameCardStandings';

function participant(userId: string): GameParticipant {
  return {
    id: `p-${userId}`,
    userId,
    gameId: 'g1',
    role: 'PLAYER',
    status: 'PLAYING',
    joinedAt: '',
    user: { id: userId, firstName: userId, lastName: '' } as GameParticipant['user'],
  } as GameParticipant;
}

function outcome(userId: string, position: number | null | undefined): GameOutcome {
  return {
    id: `o-${userId}`,
    gameId: 'g1',
    userId,
    levelBefore: 1,
    levelAfter: 1,
    levelChange: 0,
    reliabilityBefore: 0,
    reliabilityAfter: 0,
    reliabilityChange: 0,
    pointsEarned: 0,
    position: position ?? undefined,
    isWinner: position === 1,
    wins: 0,
    ties: 0,
    losses: 0,
    scoresMade: 0,
    scoresLost: 0,
    user: { id: userId } as GameOutcome['user'],
  };
}

describe('hasOutcomeStandings', () => {
  it('requires FINAL plus at least one numeric position', () => {
    expect(hasOutcomeStandings('FINAL', [outcome('a', 1)])).toBe(true);
    expect(hasOutcomeStandings('FINAL', [outcome('a', null)])).toBe(false);
    expect(hasOutcomeStandings('IN_PROGRESS', [outcome('a', 1)])).toBe(false);
    expect(hasOutcomeStandings('FINAL', [])).toBe(false);
  });
});

describe('orderPlayingParticipantsByStandings', () => {
  it('returns participants unchanged when no positioned outcomes', () => {
    const players = [participant('a'), participant('b')];
    const result = orderPlayingParticipantsByStandings(players, [
      outcome('a', null),
      outcome('b', null),
    ]);
    expect(result.participants.map((p) => p.userId)).toEqual(['a', 'b']);
    expect(result.placeByUserId).toEqual({});
  });

  it('sorts by position and maps places only for playing ranked users', () => {
    const players = [participant('c'), participant('a'), participant('b')];
    const outcomes = [outcome('c', 3), outcome('a', 1), outcome('b', 2), outcome('ghost', 4)];
    const result = orderPlayingParticipantsByStandings(players, outcomes);
    expect(result.participants.map((p) => p.userId)).toEqual(['a', 'b', 'c']);
    expect(result.placeByUserId).toEqual({ a: 1, b: 2, c: 3 });
  });

  it('keeps tied places and appends players missing outcomes', () => {
    const players = [participant('x'), participant('a'), participant('b')];
    const outcomes = [outcome('a', 1), outcome('b', 1)];
    const result = orderPlayingParticipantsByStandings(players, outcomes);
    expect(result.participants.map((p) => p.userId)).toEqual(['a', 'b', 'x']);
    expect(result.placeByUserId).toEqual({ a: 1, b: 1 });
  });

  it('ignores malformed outcome rows and position-less training rows', () => {
    const players = [participant('a'), participant('t')];
    const result = orderPlayingParticipantsByStandings(players, [
      { userId: '', position: 1 } as GameOutcome,
      null as unknown as GameOutcome,
      outcome('t', null),
      outcome('a', 1),
    ]);
    expect(result.participants.map((p) => p.userId)).toEqual(['a', 't']);
    expect(result.placeByUserId).toEqual({ a: 1 });
  });

  it('keeps the best place when duplicate userId outcomes exist', () => {
    const players = [participant('a')];
    const result = orderPlayingParticipantsByStandings(players, [
      outcome('a', 3),
      outcome('a', 1),
    ]);
    expect(result.placeByUserId).toEqual({ a: 1 });
  });
});

describe('gameCardOutcomesKey', () => {
  it('is order-stable and ignores position-less rows', () => {
    const a = [outcome('a', 1), outcome('b', 2), outcome('t', null)];
    const b = [outcome('b', 2), outcome('a', 1)];
    expect(gameCardOutcomesKey(a)).toBe('a:1|b:2');
    expect(gameCardOutcomesKey(b)).toBe('a:1|b:2');
    expect(gameCardOutcomesKey([outcome('t', null)])).toBe('');
  });
});

describe('placeMapsEqual', () => {
  it('compares place maps by value', () => {
    expect(placeMapsEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(placeMapsEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(placeMapsEqual(undefined, {})).toBe(true);
  });
});
