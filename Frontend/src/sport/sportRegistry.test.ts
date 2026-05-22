import { describe, expect, it } from 'vitest';
import { Sports } from '@shared/sport';
import { DEFAULT_PLAYERS_PER_MATCH_BY_SPORT } from '@shared/sportRegistryDefaults';
import { ALL_SPORTS, getSportConfig } from './sportRegistry';

describe('sportRegistry defaults', () => {
  it('defaultPlayersPerMatch matches shared canonical map', () => {
    for (const sport of ALL_SPORTS) {
      expect(getSportConfig(sport).defaultPlayersPerMatch).toBe(
        DEFAULT_PLAYERS_PER_MATCH_BY_SPORT[sport],
      );
    }
  });

  it('padel defaults to doubles match size; other sports default to singles pair', () => {
    expect(getSportConfig(Sports.PADEL).defaultPlayersPerMatch).toBe(4);
    for (const sport of ALL_SPORTS) {
      if (sport === Sports.PADEL) continue;
      expect(getSportConfig(sport).defaultPlayersPerMatch).toBe(2);
    }
  });
});
