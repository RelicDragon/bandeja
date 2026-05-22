import { describe, expect, it } from 'vitest';
import { Sports } from '@shared/sport';
import { ALL_SPORTS, getSportConfig } from './sportRegistry';
import { getSportConfig as getBeSportConfig } from '@backend/sport/sportRegistry';

describe('sportRegistry BE/FE parity', () => {
  it('defaultPlayersPerMatch matches Backend sportRegistry', () => {
    for (const sport of ALL_SPORTS) {
      expect(getSportConfig(sport).defaultPlayersPerMatch).toBe(
        getBeSportConfig(sport).defaultPlayersPerMatch,
      );
    }
  });

  it('padel defaults to doubles match size; other sports default to singles pair', () => {
    expect(getSportConfig(Sports.PADEL).defaultPlayersPerMatch).toBe(4);
    expect(getBeSportConfig(Sports.PADEL).defaultPlayersPerMatch).toBe(4);
    for (const sport of ALL_SPORTS) {
      if (sport === Sports.PADEL) continue;
      expect(getSportConfig(sport).defaultPlayersPerMatch).toBe(2);
      expect(getBeSportConfig(sport).defaultPlayersPerMatch).toBe(2);
    }
  });
});
