import { describe, expect, it } from 'vitest';
import { invitePreFilterCount, filterAndSortInviteEntries } from './inviteEntries';
import type { BasicUser } from '@/types';
import { Sports } from '@shared/sport';
import { defaultPlayerInviteFilters } from './playerInviteFilters';

describe('inviteEntries sport-aware level filtering', () => {
  const padelPlayer: BasicUser = {
    id: 'p1',
    firstName: 'Padel',
    lastName: 'Pro',
    level: 3.0,
    socialLevel: 2,
    gender: 'MALE',
    approvedLevel: false,
    isTrainer: false,
    sportsEnabled: [Sports.PADEL, Sports.TENNIS],
    sportProfiles: [
      { sport: Sports.PADEL, level: 3.0, reliability: 0.5, gamesPlayed: 10, gamesWon: 5, levelSource: 'DEFAULT' },
      { sport: Sports.TENNIS, level: 5.5, reliability: 0.5, gamesPlayed: 2, gamesWon: 1, levelSource: 'DEFAULT' },
    ],
  };

  const filters = {
    ...defaultPlayerInviteFilters(5),
    levelRange: [1.0, 4.0] as [number, number],
    socialRange: [0, 5] as [number, number],
  };

  it('filterAndSortInviteEntries uses game sport for level band', () => {
    const tennis = filterAndSortInviteEntries([padelPlayer], [], {
      searchQuery: '',
      filterPlayerIds: [],
      filters,
      inviteAsTrainerOnly: false,
      isFavorite: () => false,
      getUserMetadata: () => undefined,
      showTeams: false,
      gameSport: Sports.TENNIS,
    });
    expect(tennis).toHaveLength(0);

    const padel = filterAndSortInviteEntries([padelPlayer], [], {
      searchQuery: '',
      filterPlayerIds: [],
      filters,
      inviteAsTrainerOnly: false,
      isFavorite: () => false,
      getUserMetadata: () => undefined,
      showTeams: false,
      gameSport: Sports.PADEL,
    });
    expect(padel).toHaveLength(1);
  });

  it('invitePreFilterCount applies level filters when provided', () => {
    const withoutLevel = invitePreFilterCount([padelPlayer], [], {
      inviteAsTrainerOnly: false,
      filterPlayerIds: [],
      showTeams: false,
      gameSport: Sports.TENNIS,
    });
    expect(withoutLevel).toBe(1);

    const withLevel = invitePreFilterCount([padelPlayer], [], {
      inviteAsTrainerOnly: false,
      filterPlayerIds: [],
      showTeams: false,
      gameSport: Sports.TENNIS,
      filters,
    });
    expect(withLevel).toBe(0);
  });
});

describe('inviteEntries inactive sort', () => {
  function player(partial: Partial<BasicUser> & Pick<BasicUser, 'id'>): BasicUser {
    return {
      firstName: partial.id,
      lastName: 'P',
      level: 3,
      socialLevel: 2,
      gender: 'MALE',
      approvedLevel: false,
      isTrainer: false,
      inactive: false,
      ...partial,
    };
  }

  const sortOpts = {
    searchQuery: '',
    filterPlayerIds: [] as string[],
    filters: defaultPlayerInviteFilters(5),
    inviteAsTrainerOnly: false,
    isFavorite: () => false,
    getUserMetadata: () => undefined,
    showTeams: false,
  };

  it('sorts inactive players to the bottom by default', () => {
    const activeLow = player({ id: 'active-low', inactive: false });
    const inactiveHigh = player({ id: 'inactive-high', inactive: true });
    const activeHigh = player({ id: 'active-high', inactive: false });
    const sorted = filterAndSortInviteEntries([inactiveHigh, activeLow, activeHigh], [], {
      ...sortOpts,
      getUserMetadata: (id) => ({
        interactionCount: id === 'active-high' ? 2 : id === 'inactive-high' ? 9 : 1,
        gamesTogetherCount: 0,
        lastFetchedAt: 0,
      }),
    });
    expect(sorted.map((entry) => entry.id)).toEqual(['active-high', 'active-low', 'inactive-high']);
  });

  it('keeps availability ahead of inactive', () => {
    const inactiveFull = player({ id: 'inactive-full', inactive: true });
    const activeNone = player({ id: 'active-none', inactive: false });
    const sorted = filterAndSortInviteEntries([inactiveFull, activeNone], [], {
      ...sortOpts,
      getAvailabilityMatch: (entry) => (entry.id === 'inactive-full' ? 'full' : 'none'),
    });
    expect(sorted.map((entry) => entry.id)).toEqual(['inactive-full', 'active-none']);
  });

  it('treats missing inactive as inactive', () => {
    const unknown = player({ id: 'unknown' });
    delete (unknown as { inactive?: boolean }).inactive;
    const active = player({ id: 'active', inactive: false });
    const sorted = filterAndSortInviteEntries([unknown, active], [], sortOpts);
    expect(sorted.map((entry) => entry.id)).toEqual(['active', 'unknown']);
  });

  it('reads sport-profile inactive when the projected flag is omitted', () => {
    const fromProfile = player({
      id: 'from-profile',
      sportProfiles: [
        {
          sport: Sports.PADEL,
          level: 3,
          reliability: 0.5,
          gamesPlayed: 10,
          gamesWon: 5,
          inactive: true,
          levelSource: 'DEFAULT',
        },
      ],
    });
    delete (fromProfile as { inactive?: boolean }).inactive;
    const active = player({ id: 'active', inactive: false });
    const sorted = filterAndSortInviteEntries([fromProfile, active], [], {
      ...sortOpts,
      gameSport: Sports.PADEL,
    });
    expect(sorted.map((entry) => entry.id)).toEqual(['active', 'from-profile']);
  });
});
