import assert from 'node:assert/strict';
import { Sport } from '@prisma/client';
import { isPresetLegal } from './isPresetLegal';
import { getSportConfig } from '../sport/sportRegistry';

type Case = {
  label: string;
  sport: Sport;
  preset: string;
  legal: boolean;
  gameType?: string;
  matchGenerationType?: string;
  scoringMode?: 'CLASSIC' | 'POINTS';
  createIntent?: 'social' | 'match' | 'advanced';
};

const CASES: Case[] = [
  {
    label: 'padel social americano points',
    sport: Sport.PADEL,
    preset: 'POINTS_24',
    legal: true,
    gameType: 'AMERICANO',
    matchGenerationType: 'RANDOM',
    scoringMode: 'POINTS',
    createIntent: 'social',
  },
  {
    label: 'padel match classic bo3',
    sport: Sport.PADEL,
    preset: 'CLASSIC_BEST_OF_3',
    legal: true,
    gameType: 'CLASSIC',
    matchGenerationType: 'AUTOMATIC',
    scoringMode: 'CLASSIC',
    createIntent: 'match',
  },
  {
    label: 'padel points preset blocked on classic gameType',
    sport: Sport.PADEL,
    preset: 'POINTS_24',
    legal: false,
    gameType: 'CLASSIC',
    scoringMode: 'POINTS',
  },
  {
    label: 'badminton social americano budget',
    sport: Sport.BADMINTON,
    preset: 'POINTS_21',
    legal: true,
    gameType: 'AMERICANO',
    matchGenerationType: 'RANDOM',
    scoringMode: 'POINTS',
    createIntent: 'social',
  },
  {
    label: 'badminton match bo3 21',
    sport: Sport.BADMINTON,
    preset: 'BEST_OF_3_21',
    legal: true,
    gameType: 'CLASSIC',
    matchGenerationType: 'AUTOMATIC',
    scoringMode: 'POINTS',
    createIntent: 'match',
  },
  {
    label: 'badminton match intent blocks social-only points',
    sport: Sport.BADMINTON,
    preset: 'POINTS_21',
    legal: false,
    gameType: 'AMERICANO',
    matchGenerationType: 'RANDOM',
    scoringMode: 'POINTS',
    createIntent: 'match',
  },
  {
    label: 'pickleball social doubles americano',
    sport: Sport.PICKLEBALL,
    preset: 'POINTS_21',
    legal: true,
    gameType: 'AMERICANO',
    matchGenerationType: 'RANDOM',
    scoringMode: 'POINTS',
    createIntent: 'social',
  },
  {
    label: 'pickleball match bo3 11',
    sport: Sport.PICKLEBALL,
    preset: 'BEST_OF_3_11',
    legal: true,
    gameType: 'CLASSIC',
    matchGenerationType: 'AUTOMATIC',
    scoringMode: 'POINTS',
    createIntent: 'match',
  },
  {
    label: 'pickleball timed blocked at create',
    sport: Sport.PICKLEBALL,
    preset: 'TIMED',
    legal: false,
  },
  {
    label: 'table tennis social single game',
    sport: Sport.TABLE_TENNIS,
    preset: 'POINTS_11',
    legal: true,
    gameType: 'CUSTOM',
    matchGenerationType: 'AUTOMATIC',
    scoringMode: 'POINTS',
    createIntent: 'social',
  },
  {
    label: 'table tennis match bo3 11',
    sport: Sport.TABLE_TENNIS,
    preset: 'BEST_OF_3_11',
    legal: true,
    gameType: 'CLASSIC',
    matchGenerationType: 'AUTOMATIC',
    scoringMode: 'POINTS',
    createIntent: 'match',
  },
  {
    label: 'table tennis padel-only preset',
    sport: Sport.TABLE_TENNIS,
    preset: 'POINTS_24',
    legal: false,
  },
];

for (const row of CASES) {
  const config = getSportConfig(row.sport);
  const result = isPresetLegal({
    sport: row.sport,
    preset: row.preset,
    allowedScoringPresets: config.allowedScoringPresets,
    presetMeta: config.presetMeta,
    gameType: row.gameType,
    matchGenerationType: row.matchGenerationType,
    scoringMode: row.scoringMode,
    createIntent: row.createIntent,
  });
  assert.equal(result, row.legal, row.label);
}

for (const sport of [Sport.PADEL, Sport.BADMINTON, Sport.PICKLEBALL, Sport.TABLE_TENNIS]) {
  const config = getSportConfig(sport);
  for (const preset of config.allowedScoringPresets) {
    if (preset === 'CUSTOM' || preset === 'TIMED') continue;
    let scoringMode: 'CLASSIC' | 'POINTS' = 'POINTS';
    let matchGenerationType: 'AUTOMATIC' | 'RANDOM' = 'RANDOM';
    let gameType: 'CLASSIC' | 'AMERICANO' | 'CUSTOM' = 'AMERICANO';
    if (preset.startsWith('CLASSIC_')) {
      scoringMode = 'CLASSIC';
      matchGenerationType = 'AUTOMATIC';
      gameType = 'CLASSIC';
    } else if (
      preset.startsWith('BEST_OF_') ||
      preset === 'SINGLE_GAME_21' ||
      preset === 'PAR_11'
    ) {
      matchGenerationType = 'AUTOMATIC';
      gameType = 'CLASSIC';
    } else if (preset.startsWith('POINTS_')) {
      matchGenerationType = 'RANDOM';
      gameType = 'AMERICANO';
    } else {
      continue;
    }
    assert.equal(
      isPresetLegal({
        sport,
        preset,
        allowedScoringPresets: config.allowedScoringPresets,
        scoringMode,
        matchGenerationType,
        gameType,
      }),
      true,
      `${sport} ${preset} wizard/backend parity`,
    );
  }
}

console.log('ok: isPresetLegal.test.ts');
