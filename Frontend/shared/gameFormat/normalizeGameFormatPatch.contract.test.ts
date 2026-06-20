import { describe, expect, it } from 'vitest';
import { normalizeGameFormatPatch as feNormalize } from '@shared/gameFormat';
import { normalizeGameFormatPatch as beNormalize } from '@backend/utils/gameFormat/normalizeGameFormatPatch';
import { buildGameFormatUpdatePayload } from '@/utils/gameFormat/buildGameFormatUpdatePayload';
import type { UseGameFormatResult } from '@/hooks/useGameFormat';

const EMPTY_EXISTING = {
  gameType: 'CLASSIC',
  scoringPreset: null,
  scoringMode: null,
  matchTimerEnabled: false,
  matchTimedCapMinutes: 0,
  maxTotalPointsPerSet: 0,
  winnerOfMatch: 'BY_SCORES',
  playersPerMatch: 4,
  hasFixedTeams: false,
  allowUserInMultipleTeams: false,
  maxParticipants: 4,
  sport: 'PADEL',
};

function beCreate(patch: Record<string, unknown>) {
  return beNormalize({ existingGame: EMPTY_EXISTING, patch, entityType: 'GAME' as never });
}

function feCreate(patch: Record<string, unknown>) {
  return feNormalize({ existingGame: EMPTY_EXISTING, patch, entityType: 'GAME' });
}

function pickNormalizedKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const keys = [
    'scoringPreset',
    'matchTimerEnabled',
    'matchTimedCapMinutes',
    'maxTotalPointsPerSet',
    'deucesBeforeGoldenPoint',
    'ballsInGames',
    'playersPerMatch',
    'hasFixedTeams',
    'allowUserInMultipleTeams',
    'winnerOfGame',
  ];
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (k in obj) out[k] = obj[k];
  }
  return out;
}

describe('game format normalization contract (FE preview ≡ BE persist)', () => {
  it('padel classic best-of-3 with golden point', () => {
    const patch = {
      gameType: 'CLASSIC',
      scoringPreset: 'CLASSIC_BEST_OF_3',
      scoringMode: 'CLASSIC',
      deucesBeforeGoldenPoint: 0,
    };
    expect(pickNormalizedKeys(feCreate(patch))).toEqual(pickNormalizedKeys(beCreate(patch)));
  });

  it('americano points-16 strips golden point', () => {
    const patch = {
      gameType: 'AMERICANO',
      scoringPreset: 'POINTS_16',
      scoringMode: 'POINTS',
      deucesBeforeGoldenPoint: 0,
    };
    expect(pickNormalizedKeys(feCreate(patch))).toEqual(pickNormalizedKeys(beCreate(patch)));
  });

  it('legacy TIMED preset normalizes to POINTS_21 + timer', () => {
    const patch = {
      gameType: 'AMERICANO',
      scoringPreset: 'TIMED',
      matchTimedCapMinutes: 0,
      deucesBeforeGoldenPoint: 0,
    };
    expect(pickNormalizedKeys(feCreate(patch))).toEqual(pickNormalizedKeys(beCreate(patch)));
  });

  it('badminton best-of-3-11 derives ballsInGames false', () => {
    const patch = {
      gameType: 'CUSTOM',
      scoringPreset: 'BEST_OF_3_11',
      scoringMode: 'POINTS',
      sport: 'BADMINTON',
    };
    expect(pickNormalizedKeys(feCreate(patch))).toEqual(pickNormalizedKeys(beCreate(patch)));
  });

  it('singles clears fixed teams flags', () => {
    const patch = {
      playersPerMatch: 2,
      hasFixedTeams: true,
      allowUserInMultipleTeams: true,
    };
    expect(pickNormalizedKeys(feCreate(patch))).toEqual(pickNormalizedKeys(beCreate(patch)));
  });

  it('league season winnerOfGame BY_POINTS remap', () => {
    const patch = { winnerOfGame: 'BY_POINTS', scoringMode: 'POINTS' };
    const existing = { ...EMPTY_EXISTING, scoringMode: 'POINTS' };
    const fe = feNormalize({ existingGame: existing, patch, entityType: 'LEAGUE_SEASON' });
    const be = beNormalize({
      existingGame: existing,
      patch,
      entityType: 'LEAGUE_SEASON' as never,
    });
    expect(fe.winnerOfGame).toBe('BY_SCORES_DELTA');
    expect(be.winnerOfGame).toBe('BY_SCORES_DELTA');
  });

  it('buildGameFormatUpdatePayload matches BE normalize on wizard stub', () => {
    const stubFormat = {
      gameType: 'AMERICANO',
      scoringMode: 'POINTS',
      scoringPreset: 'POINTS_16',
      setupPayload: {
        fixedNumberOfSets: 1,
        maxTotalPointsPerSet: 0,
        matchTimedCapMinutes: 0,
        matchTimerEnabled: false,
        maxPointsPerTeam: 0,
        winnerOfGame: 'BY_SCORES_DELTA',
        winnerOfMatch: 'BY_SCORES',
        matchGenerationType: 'RANDOM',
        pointsPerWin: 3,
        pointsPerLoose: 1,
        pointsPerTie: 2,
        ballsInGames: false,
        scoringPreset: 'POINTS_16',
        deucesBeforeGoldenPoint: 0,
      },
    } as unknown as UseGameFormatResult;

    const fePayload = buildGameFormatUpdatePayload({
      entityType: 'GAME',
      gameFormat: stubFormat,
      playersPerMatch: 4,
      existingGame: EMPTY_EXISTING,
    });

    const bePayload = beNormalize({
      existingGame: EMPTY_EXISTING,
      patch: fePayload,
      entityType: 'GAME' as never,
    });

    for (const key of Object.keys(fePayload)) {
      expect(fePayload[key]).toEqual(bePayload[key]);
    }
  });
});
