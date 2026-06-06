import { describe, expect, it } from 'vitest';
import { Sports } from '@shared/sport';
import {
  ROTATION_BY_SPORT,
  gameTypeMatchGenerationMismatch,
  gameTypesFromRotation,
  resolvePairedMatchGeneration,
} from '@/sport/rotationFormats';
import { ALL_SPORTS, getSportConfig } from '@/sport/sportRegistry';

describe('rotationFormats shared policy', () => {
  it('includes rotation-policy game types in sport registry allowlists', () => {
    for (const sport of ALL_SPORTS) {
      const cfg = getSportConfig(sport);
      for (const gameType of gameTypesFromRotation(ROTATION_BY_SPORT[sport])) {
        expect(cfg.allowedGameTypes).toContain(gameType);
      }
    }
  });

  it('detects illegal gameType and matchGenerationType pairings', () => {
    expect(gameTypeMatchGenerationMismatch('AMERICANO', 'RATING')).not.toBeNull();
    expect(gameTypeMatchGenerationMismatch('MEXICANO', 'RANDOM')).not.toBeNull();
    expect(gameTypeMatchGenerationMismatch('CLASSIC', 'AUTOMATIC')).toBeNull();
    expect(gameTypeMatchGenerationMismatch('AMERICANO', 'RANDOM')).toBeNull();
  });

  it('resolves mismatched pairs to backend-accepted generation', () => {
    expect(resolvePairedMatchGeneration('MEXICANO', 'RANDOM')).toBe('RATING');
    expect(resolvePairedMatchGeneration('AMERICANO', 'RATING')).toBe('RANDOM');
    expect(resolvePairedMatchGeneration('KOTC', 'RANDOM')).toBe('KING_OF_COURT');
  });

  it('table tennis allows ladder and round robin but not americano', () => {
    const rot = ROTATION_BY_SPORT[Sports.TABLE_TENNIS];
    expect(rot.americano).toBe(false);
    expect(rot.ladder).toBe(true);
    expect(rot.roundRobin).toBe(true);
    expect(getSportConfig(Sports.TABLE_TENNIS).allowedGameTypes).toContain('LADDER');
    expect(getSportConfig(Sports.TABLE_TENNIS).allowedGameTypes).not.toContain('AMERICANO');
  });
});
