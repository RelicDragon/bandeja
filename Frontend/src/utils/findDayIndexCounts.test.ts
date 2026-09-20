import { describe, expect, it } from 'vitest';
import {
  aggregateFindDayIndexByDay,
  countFindDayIndexByDay,
  mergeFindDayIndexIntoCardDays,
  type FindDayIndexRow,
} from './findDayIndexCounts';
import type { FindFilterState } from '@/utils/findFilter';
import { DEFAULT_AVAILABLE_GAME_PANEL_FILTERS } from '@/utils/availableGamePanelFilters';

function row(partial: Partial<FindDayIndexRow> & Pick<FindDayIndexRow, 'id' | 'startTime'>): FindDayIndexRow {
  return {
    entityType: 'GAME',
    minLevel: 1,
    maxLevel: 7,
    maxParticipants: 4,
    genderTeams: 'ANY',
    trainerId: null,
    clubId: 'c1',
    isPublic: true,
    timeIsSet: true,
    ownerUserId: 'owner',
    sport: 'PADEL',
    ...partial,
  };
}

const baseState: FindFilterState = {
  filterAvailableSlots: false,
  filterSuitableRating: false,
  hideBarGames: false,
  gameFilter: false,
  trainingFilter: false,
  tournamentFilter: false,
  leaguesFilter: false,
  eventsFilter: false,
  showPrivateGames: false,
  findDiscoveryEnabled: false,
  filterNoRating: false,
  panel: DEFAULT_AVAILABLE_GAME_PANEL_FILTERS,
};

describe('countFindDayIndexByDay', () => {
  it('buckets local calendar days from light index', () => {
    const counts = countFindDayIndexByDay(
      [
        row({ id: 'a', startTime: '2026-07-01T10:00:00.000Z' }),
        row({ id: 'b', startTime: '2026-07-01T18:00:00.000Z' }),
        row({ id: 'c', startTime: '2026-07-02T10:00:00.000Z' }),
      ],
      { id: 'u1' },
      baseState,
    );
    const total = [...counts.values()].reduce((s, n) => s + n, 0);
    expect(total).toBe(3);
  });

  it('does not drop coalesced club rows (structural clubs already server-applied)', () => {
    const counts = countFindDayIndexByDay(
      [
        row({ id: 'a', startTime: '2026-07-01T10:00:00.000Z', clubId: 'court-club' }),
        row({ id: 'b', startTime: '2026-07-01T11:00:00.000Z', clubId: 'other' }),
      ],
      { id: 'u1' },
      {
        ...baseState,
        panel: { ...DEFAULT_AVAILABLE_GAME_PANEL_FILTERS, filterClubIds: ['court-club'] },
      },
    );
    // Server already filtered; client must not re-drop by clubIds.
    const total = [...counts.values()].reduce((s, n) => s + n, 0);
    expect(total).toBe(2);
  });

  it('applies time-of-day residual filter', () => {
    const counts = countFindDayIndexByDay(
      [
        row({ id: 'a', startTime: '2026-07-01T08:00:00.000Z' }),
        row({ id: 'b', startTime: '2026-07-01T20:00:00.000Z' }),
      ],
      { id: 'u1' },
      {
        ...baseState,
        panel: {
          ...DEFAULT_AVAILABLE_GAME_PANEL_FILTERS,
          filterTimeStart: '18:00',
          filterTimeEnd: '23:00',
        },
      },
      'UTC',
    );
    const total = [...counts.values()].reduce((s, n) => s + n, 0);
    expect(total).toBe(1);
  });

  it('buckets onto city calendar day (early UTC morning)', () => {
    const counts = countFindDayIndexByDay(
      [row({ id: 'early', startTime: '2026-07-23T04:00:00.000Z' })],
      { id: 'u1' },
      baseState,
      'Europe/Belgrade',
    );
    expect(counts.get('2026-07-23')).toBe(1);
    expect(counts.get('2026-07-22')).toBeUndefined();
  });

  it('uses the server-projected city date key when present', () => {
    const counts = countFindDayIndexByDay(
      [
        row({
          id: 'server-bucketed',
          startTime: '2026-07-01T23:30:00.000Z',
          dateKey: '2026-07-02',
        } as Partial<FindDayIndexRow> & Pick<FindDayIndexRow, 'id' | 'startTime'>),
      ],
      { id: 'u1' },
      baseState,
      'UTC',
    );

    expect(counts.get('2026-07-02')).toBe(1);
    expect(counts.get('2026-07-01')).toBeUndefined();
  });

  it('uses projected keys for a full 5,000-row page without parsing start times', () => {
    const rows = Array.from({ length: 5_000 }, (_, index) => row({
      id: `server-bucketed-${index}`,
      startTime: 'invalid-if-the-fallback-is-touched',
      dateKey: '2026-07-02',
    }));

    const counts = countFindDayIndexByDay(rows, { id: 'u1' }, baseState, 'UTC');

    expect(counts.get('2026-07-02')).toBe(5_000);
  });

  it('reuses one timezone formatter across a 5,000-row legacy-server fallback', () => {
    const rows = Array.from({ length: 5_000 }, (_, index) => row({
      id: `legacy-server-${index}`,
      startTime: new Date(Date.UTC(2026, 6, 1, 0, 0, index)).toISOString(),
    }));
    const run = () => countFindDayIndexByDay(rows, { id: 'u1' }, baseState, 'UTC');
    run(); // Warm the timezone formatter and JIT before measuring.

    // The regression this guards is a formatter constructed per row. Counting
    // constructions tests that directly and deterministically; the wall-clock
    // budget this replaced was ~10ms against a 100ms limit, so it failed
    // whenever the machine was busy rather than when the code was wrong.
    // Rows share a timezone, so a correct run builds at most one formatter
    // here — and none at all when an earlier test already cached it.
    const OriginalDateTimeFormat = Intl.DateTimeFormat;
    let constructions = 0;
    const CountingDateTimeFormat = function (
      this: unknown,
      ...args: ConstructorParameters<typeof Intl.DateTimeFormat>
    ) {
      constructions += 1;
      return new OriginalDateTimeFormat(...args);
    } as unknown as typeof Intl.DateTimeFormat;
    Object.setPrototypeOf(CountingDateTimeFormat, OriginalDateTimeFormat);
    CountingDateTimeFormat.prototype = OriginalDateTimeFormat.prototype;

    let durationMs: number;
    Intl.DateTimeFormat = CountingDateTimeFormat;
    try {
      const startedAt = performance.now();
      run();
      durationMs = performance.now() - startedAt;
    } finally {
      Intl.DateTimeFormat = OriginalDateTimeFormat;
    }

    expect(constructions).toBeLessThanOrEqual(1);
    // Loose upper bound, ~200x the normal ~10ms, purely to catch something
    // becoming pathologically slow in a way the count above would not show.
    expect(durationMs).toBeLessThan(2_000);
  });

  it('applies discovery no-rating residual for list/badge parity', () => {
    const counts = countFindDayIndexByDay(
      [
        row({ id: 'rated', startTime: '2026-07-01T10:00:00.000Z', affectsRating: true }),
        row({ id: 'casual', startTime: '2026-07-01T11:00:00.000Z', affectsRating: false }),
      ],
      { id: 'u1' },
      {
        ...baseState,
        findDiscoveryEnabled: true,
        filterNoRating: true,
      },
    );
    const total = [...counts.values()].reduce((s, n) => s + n, 0);
    expect(total).toBe(1);
  });

  it('keeps BAR events in counts regardless of rating filters', () => {
    const counts = countFindDayIndexByDay(
      [
        row({
          id: 'bar',
          startTime: '2026-07-01T10:00:00.000Z',
          entityType: 'BAR',
          minLevel: 5,
          maxLevel: 7,
          affectsRating: true,
        }),
      ],
      { id: 'u1', level: 2 },
      {
        ...baseState,
        filterSuitableRating: true,
        findDiscoveryEnabled: true,
        filterNoRating: true,
      },
    );

    expect([...counts.values()]).toEqual([1]);
  });
});

describe('aggregateFindDayIndexByDay', () => {
  it('collects entity types for days with no fat cards', () => {
    const byDay = aggregateFindDayIndexByDay(
      [
        row({ id: 'g', startTime: '2026-07-23T10:00:00.000Z', entityType: 'GAME' }),
        row({ id: 't', startTime: '2026-07-23T12:00:00.000Z', entityType: 'TRAINING' }),
        row({ id: 'l', startTime: '2026-07-23T14:00:00.000Z', entityType: 'LEAGUE_SEASON' }),
        row({ id: 'e', startTime: '2026-07-23T16:00:00.000Z', entityType: 'EVENT' }),
      ],
      { id: 'u1' },
      baseState,
      'UTC',
    );
    const day = byDay.get('2026-07-23');
    expect(day?.gameCount).toBe(4);
    expect([...day!.entityTypes].sort()).toEqual(['EVENT', 'GAME', 'LEAGUE', 'TRAINING']);
    expect(day?.hasTraining).toBe(true);
    expect(day?.hasLeagueTournament).toBe(true);
  });

  it('favorite trainer residual only drops other trainings, not games', () => {
    const byDay = aggregateFindDayIndexByDay(
      [
        row({
          id: 'game',
          startTime: '2026-07-23T10:00:00.000Z',
          entityType: 'GAME',
        }),
        row({
          id: 'fav',
          startTime: '2026-07-23T11:00:00.000Z',
          entityType: 'TRAINING',
          trainerId: 'trainer-1',
        }),
        row({
          id: 'other',
          startTime: '2026-07-23T12:00:00.000Z',
          entityType: 'TRAINING',
          trainerId: 'trainer-2',
        }),
      ],
      { id: 'u1', favoriteTrainerId: 'trainer-1' },
      { ...baseState, gameFilter: true, trainingFilter: true },
      'UTC',
    );
    const day = byDay.get('2026-07-23');
    expect(day?.gameIds.sort()).toEqual(['fav', 'game']);
  });
});

describe('mergeFindDayIndexIntoCardDays', () => {
  it('keeps card entity types when overlaying index count (no wipe)', () => {
    const fromCards = new Map([
      [
        '2026-07-23',
        {
          gameCount: 1,
          gameIds: ['c1'],
          unreadCount: 0,
          hasLeagueTournament: false,
          isUserParticipant: true,
          hasTraining: false,
          participantEntityTypes: new Set(['GAME' as const]),
          entityTypes: new Set(['GAME' as const]),
        },
      ],
    ]);
    const indexByDay = new Map([
      [
        '2026-07-23',
        {
          gameCount: 20,
          gameIds: ['g1', 'g2'],
          entityTypes: new Set(['GAME' as const, 'TRAINING' as const]),
          hasLeagueTournament: false,
          hasTraining: true,
          isUserParticipant: false,
          participantEntityTypes: new Set(),
        },
      ],
      [
        '2026-07-24',
        {
          gameCount: 5,
          gameIds: ['g3'],
          entityTypes: new Set(['TOURNAMENT' as const]),
          hasLeagueTournament: true,
          hasTraining: false,
          isUserParticipant: true,
          participantEntityTypes: new Set(['TOURNAMENT' as const]),
        },
      ],
    ]);

    const merged = mergeFindDayIndexIntoCardDays(fromCards, indexByDay, { g2: 2, g3: 1 });
    const d23 = merged.get('2026-07-23')!;
    expect(d23.gameCount).toBe(20);
    expect([...d23.entityTypes].sort()).toEqual(['GAME', 'TRAINING']);
    expect(d23.isUserParticipant).toBe(true);
    expect(d23.hasTraining).toBe(true);
    expect(d23.unreadCount).toBe(2);

    const d24 = merged.get('2026-07-24')!;
    expect(d24.gameCount).toBe(5);
    expect([...d24.entityTypes]).toEqual(['TOURNAMENT']);
    expect(d24.hasLeagueTournament).toBe(true);
    expect(d24.isUserParticipant).toBe(true);
    expect(d24.unreadCount).toBe(1);
  });

  it('applies unread + participant from indexOnly days (no cards)', () => {
    const indexByDay = aggregateFindDayIndexByDay(
      [
        row({
          id: 'mine',
          startTime: '2026-07-23T10:00:00.000Z',
          viewerIsParticipant: true,
          entityType: 'GAME',
        }),
      ],
      { id: 'u1' },
      baseState,
      'UTC',
    );
    const merged = mergeFindDayIndexIntoCardDays(new Map(), indexByDay, { mine: 3 });
    const day = merged.get('2026-07-23')!;
    expect(day.unreadCount).toBe(3);
    expect(day.isUserParticipant).toBe(true);
    expect([...day.participantEntityTypes]).toEqual(['GAME']);
  });
});
