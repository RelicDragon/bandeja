import { describe, expect, it } from 'vitest';
import { syncPlayersPerMatchOnRosterChange } from './matchFormat';

describe('syncPlayersPerMatchOnRosterChange', () => {
  it('forces 1v1 when roster is 2', () => {
    expect(syncPlayersPerMatchOnRosterChange(4, 2, 4, [2, 4])).toEqual({
      playersPerMatch: 2,
      resetFixedTeams: true,
    });
  });

  it('restores sport default when roster goes from 2 to 4+', () => {
    expect(syncPlayersPerMatchOnRosterChange(2, 4, 4, [2, 4])).toEqual({
      playersPerMatch: 4,
      resetFixedTeams: false,
    });
    expect(syncPlayersPerMatchOnRosterChange(2, 8, 2, [2, 4])).toEqual({
      playersPerMatch: 2,
      resetFixedTeams: false,
    });
  });

  it('does not change match format when roster stays 4+', () => {
    expect(syncPlayersPerMatchOnRosterChange(4, 6, 4, [2, 4])).toBeNull();
    expect(syncPlayersPerMatchOnRosterChange(8, 4, 4, [2, 4])).toBeNull();
  });
});
