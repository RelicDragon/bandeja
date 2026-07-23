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
});

describe('aggregateFindDayIndexByDay', () => {
  it('collects entity types for days with no fat cards', () => {
    const byDay = aggregateFindDayIndexByDay(
      [
        row({ id: 'g', startTime: '2026-07-23T10:00:00.000Z', entityType: 'GAME' }),
        row({ id: 't', startTime: '2026-07-23T12:00:00.000Z', entityType: 'TRAINING' }),
        row({ id: 'l', startTime: '2026-07-23T14:00:00.000Z', entityType: 'LEAGUE_SEASON' }),
      ],
      { id: 'u1' },
      baseState,
      'UTC',
    );
    const day = byDay.get('2026-07-23');
    expect(day?.gameCount).toBe(3);
    expect([...day!.entityTypes].sort()).toEqual(['GAME', 'LEAGUE', 'TRAINING']);
    expect(day?.hasTraining).toBe(true);
    expect(day?.hasLeagueTournament).toBe(true);
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
          entityTypes: new Set(['GAME' as const, 'TRAINING' as const]),
          hasLeagueTournament: false,
          hasTraining: true,
        },
      ],
      [
        '2026-07-24',
        {
          gameCount: 5,
          entityTypes: new Set(['TOURNAMENT' as const]),
          hasLeagueTournament: true,
          hasTraining: false,
        },
      ],
    ]);

    const merged = mergeFindDayIndexIntoCardDays(fromCards, indexByDay);
    const d23 = merged.get('2026-07-23')!;
    expect(d23.gameCount).toBe(20);
    expect([...d23.entityTypes].sort()).toEqual(['GAME', 'TRAINING']);
    expect(d23.isUserParticipant).toBe(true);
    expect(d23.hasTraining).toBe(true);

    const d24 = merged.get('2026-07-24')!;
    expect(d24.gameCount).toBe(5);
    expect([...d24.entityTypes]).toEqual(['TOURNAMENT']);
    expect(d24.hasLeagueTournament).toBe(true);
  });
});
