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
