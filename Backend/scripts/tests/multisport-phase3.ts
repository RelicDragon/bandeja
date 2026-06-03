import { Sport } from '@prisma/client';
import {
  assertRegistryMatchesPrismaEnum,
  getSportConfig,
  SPORT_REGISTRY,
} from '../../src/sport/sportRegistry';
import {
  validateGameForSport,
  validateMaxParticipants,
} from '../../src/utils/validators/validateGameForSport';
import { ApiError } from '../../src/utils/ApiError';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function assertThrows(fn: () => void, msg: string): void {
  try {
    fn();
    console.error('FAIL: expected throw —', msg);
    process.exit(1);
  } catch (e) {
    if (!(e instanceof ApiError)) {
      console.error('FAIL: wrong error type —', msg, e);
      process.exit(1);
    }
  }
}

type Phase3Expectation = {
  allowedPlayerCountsPerMatch: number[];
  defaultPlayersPerMatch: number;
  defaultPreset: string;
  validPresets: string[];
  invalidPreset: string;
  invalidPlayersPerMatch?: number;
  liveScoring: string;
};

const PHASE3: Record<
  'TABLE_TENNIS' | 'BADMINTON' | 'PICKLEBALL' | 'SQUASH',
  Phase3Expectation
> = {
  TABLE_TENNIS: {
    allowedPlayerCountsPerMatch: [2, 4],
    defaultPlayersPerMatch: 2,
    defaultPreset: 'BEST_OF_3_11',
    validPresets: ['POINTS_11', 'SINGLE_GAME_21', 'BEST_OF_3_11', 'BEST_OF_5_11'],
    invalidPreset: 'CLASSIC_BEST_OF_3',
    invalidPlayersPerMatch: 3,
    liveScoring: 'rally_points',
  },
  BADMINTON: {
    allowedPlayerCountsPerMatch: [2, 4],
    defaultPlayersPerMatch: 2,
    defaultPreset: 'BEST_OF_3_21',
    validPresets: ['BEST_OF_3_21', 'POINTS_21'],
    invalidPreset: 'CLASSIC_BEST_OF_3',
    liveScoring: 'rally_points',
  },
  PICKLEBALL: {
    allowedPlayerCountsPerMatch: [2, 4],
    defaultPlayersPerMatch: 2,
    defaultPreset: 'POINTS_21',
    validPresets: ['POINTS_16', 'POINTS_21'],
    invalidPreset: 'CLASSIC_BEST_OF_3',
    liveScoring: 'rally_points',
  },
  SQUASH: {
    allowedPlayerCountsPerMatch: [2],
    defaultPlayersPerMatch: 2,
    defaultPreset: 'BEST_OF_5_11',
    validPresets: ['BEST_OF_5_11'],
    invalidPreset: 'CLASSIC_BEST_OF_3',
    invalidPlayersPerMatch: 4,
    liveScoring: 'rally_points',
  },
};

function testRegistryContract(): void {
  assertRegistryMatchesPrismaEnum();
  const registryKeys = Object.keys(SPORT_REGISTRY).sort();
  const prismaSports = (Object.values(Sport) as Sport[]).sort();
  assert(registryKeys.length === 6, 'registry has exactly 6 sports');
  assert(registryKeys.join(',') === prismaSports.join(','), 'registry keys match Prisma Sport enum order');
  console.log('ok: registry ↔ Prisma (6 sports)');
}

function testRegistryConfig(): void {
  for (const [key, exp] of Object.entries(PHASE3) as [keyof typeof PHASE3, Phase3Expectation][]) {
    const sport = Sport[key];
    const cfg = getSportConfig(sport);
    assert(cfg.implemented, `${key} is implemented in registry`);
    assert(cfg.liveScoring === exp.liveScoring, `${key} liveScoring`);
    assert(
      cfg.allowedPlayerCountsPerMatch.join(',') === exp.allowedPlayerCountsPerMatch.join(','),
      `${key} allowedPlayerCountsPerMatch`,
    );
    assert(cfg.defaultPlayersPerMatch === exp.defaultPlayersPerMatch, `${key} defaultPlayersPerMatch`);
    for (const preset of exp.validPresets) {
      assert(cfg.allowedScoringPresets.includes(preset as never), `${key} allows ${preset}`);
    }
    assert(!cfg.allowedScoringPresets.includes(exp.invalidPreset as never), `${key} blocks tennis preset`);
    assert(cfg.defaultScoringPreset === exp.defaultPreset, `${key} defaultScoringPreset`);
  }
  console.log('ok: phase-3 sport registry configs');
}

function testCreateValidation(): void {
  for (const [key, exp] of Object.entries(PHASE3) as [keyof typeof PHASE3, Phase3Expectation][]) {
    const sport = Sport[key];
    for (const preset of exp.validPresets) {
      const doubles = exp.allowedPlayerCountsPerMatch[exp.allowedPlayerCountsPerMatch.length - 1];
      assert(
        validateGameForSport({ sport, playersPerMatch: doubles, scoringPreset: preset }) === sport,
        `${key} accepts 2v2 + ${preset}`,
      );
      const singles = exp.allowedPlayerCountsPerMatch[0];
      assert(
        validateGameForSport({ sport, playersPerMatch: singles, scoringPreset: preset }) === sport,
        `${key} accepts 1v1 + ${preset}`,
      );
    }
    assertThrows(
      () =>
        validateGameForSport({
          sport,
          playersPerMatch: exp.allowedPlayerCountsPerMatch[0],
          scoringPreset: exp.invalidPreset,
        }),
      `${key} rejects invalid preset`,
    );
    if (exp.invalidPlayersPerMatch != null) {
      assertThrows(
        () =>
          validateGameForSport({
            sport,
            playersPerMatch: exp.invalidPlayersPerMatch,
            scoringPreset: exp.defaultPreset,
          }),
        `${key} rejects invalid playersPerMatch ${exp.invalidPlayersPerMatch}`,
      );
    }
  }

  assertThrows(
    () => validateGameForSport({ sport: 'SQUASH', playersPerMatch: 4, scoringPreset: 'BEST_OF_5_11' }),
    'squash rejects 2v2 match',
  );
  assertThrows(
    () => validateGameForSport({ sport: 'TABLE_TENNIS', playersPerMatch: 2, scoringPreset: 'CLASSIC_BEST_OF_3' }),
    'table tennis rejects classic preset',
  );
  assertThrows(
    () => validateGameForSport({ sport: 'BADMINTON', playersPerMatch: 2, scoringPreset: 'POINTS_11' }),
    'badminton rejects table tennis POINTS_11 preset',
  );
  assert(
    validateGameForSport({ sport: 'PADEL', maxParticipants: 8, playersPerMatch: 4 }) === Sport.PADEL,
    'padel 8 roster + 2v2 match',
  );
  assertThrows(() => validateMaxParticipants(3, 12), 'roster rejects 3');
  console.log('ok: create validation (match size + preset) per sport');
}

function main(): void {
  testRegistryContract();
  testRegistryConfig();
  testCreateValidation();
  console.log('multisport-phase3: all passed');
}

main();
