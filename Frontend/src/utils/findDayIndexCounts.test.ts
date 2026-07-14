import { describe, expect, it } from 'vitest';
import { countFindDayIndexByDay, type FindDayIndexRow } from './findDayIndexCounts';
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
    );
    const total = [...counts.values()].reduce((s, n) => s + n, 0);
    expect(total).toBe(1);
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
