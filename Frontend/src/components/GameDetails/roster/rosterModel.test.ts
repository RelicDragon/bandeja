import { describe, expect, it } from 'vitest';
import type { CostShare, GameCostSummary } from '@/api/gameCost';
import type { Game, GameParticipant } from '@/types';
import {
  availableFilters,
  buildRosterGroups,
  countRows,
  isFaceOff,
  matchesFilter,
  openSeats,
  seatStates,
} from './rosterModel';

function participant(id: string, gender: 'MALE' | 'FEMALE' = 'MALE', status = 'PLAYING'): GameParticipant {
  return {
    userId: id,
    role: id === 'owner' ? 'OWNER' : 'PARTICIPANT',
    status,
    joinedAt: '2026-10-01T10:00:00.000Z',
    user: { id, firstName: id, lastName: '', gender },
  } as unknown as GameParticipant;
}

function share(userId: string, state: CostShare['state'] = 'UNPAID', isPayer = false): CostShare {
  return {
    userId,
    user: null,
    amountMinor: 1000,
    currency: 'EUR',
    state,
    markedPaidAt: null,
    confirmedAt: null,
    method: 'MANUAL',
    transactionId: null,
    isPayer,
    isOverridden: false,
  };
}

function cost(overrides: Partial<GameCostSummary> = {}): GameCostSummary {
  return {
    gameId: 'g1', available: true, totalMinor: 4000, currency: 'EUR', payerUserId: 'owner', payer: null,
    paymentHint: null, paymentMethods: [], countryIso2: null, frozenAt: null, estimated: true,
    shares: [share('owner', 'SETTLED', true), share('ana'), share('ivo', 'MARKED_PAID'), share('lea', 'SETTLED')],
    settledCount: 2, shareCount: 4, outstandingMinor: 2000, viewerShare: share('ana'),
    canManage: false, canConfirm: false, canRemind: false, coinsPerCurrencyUnit: null,
    viewerCoinCost: null, viewerCoinBalance: 0, remindAvailableAt: null,
    ...overrides,
  };
}

function game(participants: GameParticipant[], overrides: Partial<Game> = {}) {
  return {
    participants,
    genderTeams: 'ANY',
    maxParticipants: 4,
    entityType: 'GAME',
    ...overrides,
  } as unknown as Pick<Game, 'participants' | 'genderTeams' | 'maxParticipants' | 'entityType'>;
}

const four = ['owner', 'ana', 'ivo', 'lea'].map((id) => participant(id));

describe('buildRosterGroups — privacy', () => {
  it('gives a regular player only their own amount, even from a full stale payload', () => {
    const [group] = buildRosterGroups(game(four), {
      viewerUserId: 'ana',
      attendanceByUserId: undefined,
      cost: cost(),
    });
    const withShare = group.rows.filter((row) => row.share);
    expect(withShare.map((row) => row.userId)).toEqual(['ana']);
  });

  it('gives a collector every amount', () => {
    for (const flags of [{ canManage: true }, { canConfirm: true }]) {
      const [group] = buildRosterGroups(game(four), {
        viewerUserId: 'owner',
        attendanceByUserId: undefined,
        cost: cost(flags),
      });
      expect(group.rows.every((row) => row.share)).toBe(true);
    }
  });

  it('still shows everyone their answers', () => {
    const [group] = buildRosterGroups(game(four), {
      viewerUserId: 'ana',
      attendanceByUserId: { owner: 'CONFIRMED', ana: 'UNANSWERED', ivo: 'UNSURE', lea: 'NO_SHOW' },
      cost: cost(),
    });
    expect(group.rows.map((row) => row.attendance)).toEqual(['UNANSWERED', 'CONFIRMED', 'UNSURE', 'NO_SHOW']);
  });
});

describe('buildRosterGroups — shape', () => {
  it('pins the viewer first and keeps roster order for the rest', () => {
    const [group] = buildRosterGroups(game(four), { viewerUserId: 'ivo', attendanceByUserId: undefined, cost: null });
    expect(group.rows.map((row) => row.userId)).toEqual(['ivo', 'owner', 'ana', 'lea']);
  });

  it('counts only PLAYING participants', () => {
    const [group] = buildRosterGroups(
      game([...four.slice(0, 3), participant('queued', 'MALE', 'IN_QUEUE'), participant('coach', 'MALE', 'NON_PLAYING')]),
      { viewerUserId: undefined, attendanceByUserId: undefined, cost: null },
    );
    expect(group.rows).toHaveLength(3);
    expect(openSeats(group)).toBe(1);
  });

  it('splits mixed pairs into two half-size groups', () => {
    const groups = buildRosterGroups(
      game([participant('m1'), participant('m2'), participant('f1', 'FEMALE')], { genderTeams: 'MIX_PAIRS' } as Partial<Game>),
      { viewerUserId: 'f1', attendanceByUserId: undefined, cost: null },
    );
    expect(groups.map((group) => [group.key, group.rows.length, group.capacity])).toEqual([
      ['MALE', 2, 2],
      ['FEMALE', 1, 2],
    ]);
  });

  it('treats a bar as unlimited', () => {
    const [group] = buildRosterGroups(game(four, { entityType: 'BAR' } as Partial<Game>), {
      viewerUserId: undefined,
      attendanceByUserId: undefined,
      cost: null,
    });
    expect(group.capacity).toBeNull();
    expect(openSeats(group)).toBe(0);
  });
});

describe('seats, counts and filters', () => {
  const [group] = buildRosterGroups(game(four.slice(0, 3)), {
    viewerUserId: 'owner',
    attendanceByUserId: { owner: 'CONFIRMED', ana: 'UNSURE', ivo: 'UNANSWERED' },
    cost: cost({ canConfirm: true }),
  });

  it('tints each taken seat by its answer and leaves the rest open', () => {
    expect(seatStates(group)).toEqual(['CONFIRMED', 'UNSURE', 'UNANSWERED', null]);
  });

  it('counts answers and paid states together', () => {
    expect(countRows(group.rows)).toMatchObject({ total: 3, confirmed: 1, unsure: 1, unanswered: 1, settled: 1, unpaid: 2 });
  });

  it('offers money chips to collectors only, and drops empty chips', () => {
    const counts = countRows(group.rows);
    const forPlayer = availableFilters(counts, { hasAttendance: true, collector: false, active: 'ALL' });
    expect(forPlayer.map((chip) => chip.filter)).toEqual(['ALL', 'CONFIRMED', 'UNSURE', 'UNANSWERED']);
    const forCollector = availableFilters({ ...counts, settled: 0 }, { hasAttendance: true, collector: true, active: 'ALL' });
    expect(forCollector.map((chip) => chip.filter)).toContain('UNPAID');
    expect(forCollector.map((chip) => chip.filter)).not.toContain('SETTLED');
  });

  it('filters by answer and by paid state', () => {
    expect(group.rows.filter((row) => matchesFilter(row, 'UNANSWERED')).map((row) => row.userId)).toEqual(['ivo']);
    expect(group.rows.filter((row) => matchesFilter(row, 'UNPAID')).map((row) => row.userId)).toEqual(['ana', 'ivo']);
  });
});

describe('isFaceOff', () => {
  it('is a two-seat game without a gender split', () => {
    expect(isFaceOff({ maxParticipants: 2, genderTeams: 'ANY', entityType: 'GAME' } as Game)).toBe(true);
    expect(isFaceOff({ maxParticipants: 4, genderTeams: 'ANY', entityType: 'GAME' } as Game)).toBe(false);
    expect(isFaceOff({ maxParticipants: 2, genderTeams: 'MIX_PAIRS', entityType: 'GAME' } as Game)).toBe(false);
  });
});
