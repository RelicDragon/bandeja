/**
 * PRD 359 — the seat and queue facts a game card may state.
 */
import { describe, expect, it } from 'vitest';
import type { Game, GameParticipant } from '@/types';
import { readQueueState } from '@/features/spot-opened/queueState';
import { computeSeatInfo, type SeatInfoGame } from './gameCardSeatInfo';

function participant(
  overrides: Partial<GameParticipant> & Pick<GameParticipant, 'userId' | 'status'>,
): GameParticipant {
  return {
    role: 'PARTICIPANT',
    joinedAt: '2026-09-20T10:00:00.000Z',
    user: { id: overrides.userId },
    ...overrides,
  } as unknown as GameParticipant;
}

function game(overrides: Partial<SeatInfoGame> = {}): SeatInfoGame {
  return {
    entityType: 'GAME',
    genderTeams: 'ANY',
    maxParticipants: 4,
    ...overrides,
  } as SeatInfoGame;
}

const playing = (n: number, gender?: string) =>
  Array.from({ length: n }, (_, i) =>
    participant({ userId: `p${i}`, status: 'PLAYING', user: { id: `p${i}`, gender } as never }),
  );

describe('computeSeatInfo — open seats', () => {
  it('counts only PLAYING against the cap', () => {
    const roster = [
      ...playing(2),
      participant({ userId: 'q1', status: 'IN_QUEUE' }),
      participant({ userId: 'i1', status: 'INVITED' }),
      participant({ userId: 'n1', status: 'NON_PLAYING' }),
      participant({ userId: 'g1', status: 'GUEST' }),
    ];
    expect(computeSeatInfo(game(), roster, null).openSeats).toBe(2);
  });

  it('reports 3, 1 and 0 for a 4-max game filling up', () => {
    expect(computeSeatInfo(game(), playing(1), null).openSeats).toBe(3);
    expect(computeSeatInfo(game(), playing(3), null).openSeats).toBe(1);
    expect(computeSeatInfo(game(), playing(4), null).openSeats).toBe(0);
  });

  it('never goes negative when the roster overflows the cap', () => {
    expect(computeSeatInfo(game(), playing(6), null).openSeats).toBe(0);
  });

  it('has no number when the game has no cap', () => {
    expect(computeSeatInfo(game({ maxParticipants: null }), playing(2), null).openSeats).toBeNull();
    expect(computeSeatInfo(game({ maxParticipants: 0 }), playing(0), null).openSeats).toBeNull();
  });

  it('handles a missing roster as an empty one', () => {
    expect(computeSeatInfo(game(), undefined, null).openSeats).toBe(4);
    expect(computeSeatInfo(game(), null, null).queueLength).toBe(0);
  });
});

describe('computeSeatInfo — MIX_PAIRS', () => {
  const mix = game({ genderTeams: 'MIX_PAIRS', maxParticipants: 4 });

  it('counts the seats open to the viewer gender, not the whole game', () => {
    // 2 men seated of the 2 male seats: a man sees none free, a woman sees two.
    const roster = playing(2, 'MALE');
    expect(computeSeatInfo(mix, roster, { id: 'v', gender: 'MALE' }).openSeats).toBe(0);
    expect(computeSeatInfo(mix, roster, { id: 'v', gender: 'FEMALE' }).openSeats).toBe(2);
  });

  it('never promises more gendered seats than the game has left overall', () => {
    // 3 men seated in a 4-max MIX game (an over-filled half): one seat left in
    // total, and the female half alone would claim two.
    const roster = playing(3, 'MALE');
    expect(computeSeatInfo(mix, roster, { id: 'v', gender: 'FEMALE' }).openSeats).toBe(1);
  });

  it('shows no count at all when the viewer gender is unknown', () => {
    expect(computeSeatInfo(mix, playing(2, 'MALE'), { id: 'v' }).openSeats).toBeNull();
    expect(computeSeatInfo(mix, playing(2, 'MALE'), { id: 'v', gender: null }).openSeats).toBeNull();
    expect(computeSeatInfo(mix, playing(2, 'MALE'), { id: 'v', gender: 'OTHER' }).openSeats).toBeNull();
    expect(computeSeatInfo(mix, playing(2, 'MALE'), null).openSeats).toBeNull();
  });

  it('leaves MEN / WOMEN games on the plain total', () => {
    const men = game({ genderTeams: 'MEN' });
    expect(computeSeatInfo(men, playing(3, 'MALE'), { id: 'v', gender: 'FEMALE' }).openSeats).toBe(1);
  });
});

describe('computeSeatInfo — entity types', () => {
  it('says nothing for an unbounded roster', () => {
    for (const entityType of ['EVENT', 'BAR'] as const) {
      const roster = [...playing(2), participant({ userId: 'q1', status: 'IN_QUEUE' })];
      expect(computeSeatInfo(game({ entityType }), roster, { id: 'q1' })).toEqual({
        openSeats: null,
        queueLength: 0,
        viewerQueuePosition: null,
      });
    }
  });

  it('counts for the seated entity types', () => {
    for (const entityType of ['GAME', 'TOURNAMENT', 'TRAINING', 'LEAGUE', 'LEAGUE_SEASON'] as const) {
      expect(computeSeatInfo(game({ entityType }), playing(3), null).openSeats).toBe(1);
    }
  });
});

describe('computeSeatInfo — queue position', () => {
  const queued = [
    participant({ userId: 'b', status: 'IN_QUEUE', joinedAt: '2026-01-01T11:00:00.000Z' }),
    participant({ userId: 'a', status: 'IN_QUEUE', joinedAt: '2026-01-01T10:00:00.000Z' }),
    participant({ userId: 'c', status: 'IN_QUEUE', joinedAt: '2026-01-01T12:00:00.000Z' }),
  ];
  const full = [...playing(4), ...queued];

  it('orders by joinedAt, not by payload order', () => {
    expect(computeSeatInfo(game(), full, { id: 'a' }).viewerQueuePosition).toBe(1);
    expect(computeSeatInfo(game(), full, { id: 'b' }).viewerQueuePosition).toBe(2);
    expect(computeSeatInfo(game(), full, { id: 'c' }).viewerQueuePosition).toBe(3);
    expect(computeSeatInfo(game(), full, { id: 'a' }).queueLength).toBe(3);
  });

  it('agrees with the game page for the same roster', () => {
    // `readQueueState` reads `joinQueues`, which only the detail payload has;
    // the card re-derives it from the participant rows `joinQueues` is built
    // from (`computeJoinQueuesFromParticipants`). The two must not drift.
    const detailGame = {
      maxParticipants: 4,
      autoFillFromQueue: false,
      participants: full,
      joinQueues: queued.map((p) => ({ userId: p.userId, createdAt: p.joinedAt })),
    } as unknown as Game;
    for (const userId of ['a', 'b', 'c', 'p0', 'nobody']) {
      expect(computeSeatInfo(game(), full, { id: userId }).viewerQueuePosition).toBe(
        readQueueState(detailGame, userId).viewerPosition,
      );
    }
  });

  it('has no position for someone who is not queued', () => {
    expect(computeSeatInfo(game(), full, { id: 'p0' }).viewerQueuePosition).toBeNull();
    expect(computeSeatInfo(game(), full, null).viewerQueuePosition).toBeNull();
    expect(computeSeatInfo(game(), full, { id: undefined }).viewerQueuePosition).toBeNull();
  });

  it('drops the position rather than guessing when a row has no joinedAt', () => {
    const truncated = full.map((p) =>
      p.userId === 'c' ? ({ ...p, joinedAt: undefined } as unknown as GameParticipant) : p,
    );
    const info = computeSeatInfo(game(), truncated, { id: 'a' });
    // The queue is still known to be three long — only the order is not.
    expect(info.queueLength).toBe(3);
    expect(info.viewerQueuePosition).toBeNull();
  });

  it('reports an empty queue as zero, not as a position', () => {
    const info = computeSeatInfo(game(), playing(4), { id: 'v' });
    expect(info.queueLength).toBe(0);
    expect(info.viewerQueuePosition).toBeNull();
  });
});
