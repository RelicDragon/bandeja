import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Sports } from '@shared/sport';
import type { BasicUser } from '@/types';

const { getInvitablePlayers } = vi.hoisted(() => ({
  getInvitablePlayers: vi.fn(),
}));

vi.mock('@/api/users', () => ({
  usersApi: {
    getInvitablePlayers,
  },
}));

import { usePlayersStore } from './playersStore';

const baseUser = (): BasicUser => ({
  id: 'u1',
  firstName: 'A',
  lastName: 'B',
  level: 3.0,
  socialLevel: 1,
  gender: 'MALE',
  approvedLevel: false,
  isTrainer: false,
  sportProfiles: [
    {
      sport: Sports.PADEL,
      level: 3.0,
      reliability: 0.5,
      gamesPlayed: 1,
      gamesWon: 0,
      levelSource: 'DEFAULT',
    },
    {
      sport: Sports.TENNIS,
      level: 4.5,
      reliability: 0.5,
      gamesPlayed: 2,
      gamesWon: 1,
      levelSource: 'DEFAULT',
    },
  ],
});

describe('playersStore.fetchPlayers', () => {
  beforeEach(() => {
    usePlayersStore.getState().clear();
    getInvitablePlayers.mockReset();
  });

  it('merges cached sportProfiles on sport-scoped fetch', async () => {
    usePlayersStore.getState().setUser(baseUser());
    getInvitablePlayers.mockResolvedValue({
      data: {
        players: [
          {
            ...baseUser(),
            level: 4.5,
            sportProfiles: undefined,
            interactionCount: 2,
            gamesTogetherCount: 1,
          },
        ],
        maxSocialLevel: null,
      },
    });

    const result = await usePlayersStore.getState().fetchPlayers(undefined, Sports.TENNIS);
    expect(result).toHaveLength(1);
    expect(result[0].sportProfiles).toHaveLength(2);
    expect(result[0].interactionCount).toBe(2);
  });

  it('does not refresh global cache timestamp on sport-scoped fetch', async () => {
    usePlayersStore.setState({ lastPlayersFetchTime: 123 });
    getInvitablePlayers.mockResolvedValue({
      data: { players: [], maxSocialLevel: null },
    });

    await usePlayersStore.getState().fetchPlayers(undefined, Sports.PADEL);
    expect(usePlayersStore.getState().lastPlayersFetchTime).toBe(123);
  });

  it('updates global cache timestamp on global fetch', async () => {
    getInvitablePlayers.mockResolvedValue({
      data: { players: [baseUser()], maxSocialLevel: null },
    });

    await usePlayersStore.getState().fetchPlayers();
    expect(usePlayersStore.getState().lastPlayersFetchTime).toBeGreaterThan(0);
  });

  it('returns cached users without API when global cache is valid', async () => {
    const user = baseUser();
    usePlayersStore.setState({
      users: { [user.id]: user },
      lastPlayersFetchTime: Date.now(),
    });

    const result = await usePlayersStore.getState().fetchPlayers();
    expect(getInvitablePlayers).not.toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('u1');
  });

  it('does not satisfy searched players from the global cache', async () => {
    const cached = baseUser();
    const searched = { ...baseUser(), id: 'u2', firstName: 'Maksim', lastName: 'S' };
    usePlayersStore.setState({
      users: { [cached.id]: cached },
      lastPlayersFetchTime: Date.now(),
    });
    getInvitablePlayers.mockResolvedValue({
      data: { players: [searched], maxSocialLevel: null },
    });

    const result = await usePlayersStore.getState().fetchPlayers(undefined, undefined, 'Maksim S');

    expect(getInvitablePlayers).toHaveBeenCalledWith(undefined, undefined, 'Maksim S');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('u2');
  });
});
