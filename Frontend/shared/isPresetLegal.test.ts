import { describe, expect, it } from 'vitest';
import { Sports } from '@shared/sport';
import { isPresetLegal } from '@shared/isPresetLegal';
import { getSportConfig } from '@/sport/sportRegistry';

type Case = {
  label: string;
  sport: keyof typeof Sports;
  preset: string;
  legal: boolean;
  gameType?: string;
  matchGenerationType?: string;
  scoringMode?: 'CLASSIC' | 'POINTS';
  createIntent?: 'social' | 'match' | 'advanced';
};

const SPORTS = [
  Sports.PADEL,
  Sports.BADMINTON,
  Sports.PICKLEBALL,
  Sports.TABLE_TENNIS,
] as const;

const CASES: Case[] = [
  {
    label: 'padel social americano points',
    sport: 'PADEL',
    preset: 'POINTS_24',
    legal: true,
    gameType: 'AMERICANO',
    matchGenerationType: 'RANDOM',
    scoringMode: 'POINTS',
    createIntent: 'social',
  },
  {
    label: 'padel match classic bo3',
    sport: 'PADEL',
    preset: 'CLASSIC_BEST_OF_3',
    legal: true,
    gameType: 'CLASSIC',
    matchGenerationType: 'AUTOMATIC',
    scoringMode: 'CLASSIC',
    createIntent: 'match',
  },
  {
    label: 'padel social automatic classic',
    sport: 'PADEL',
    preset: 'CLASSIC_AUTOMATIC',
    legal: true,
    gameType: 'CLASSIC',
    matchGenerationType: 'AUTOMATIC',
    scoringMode: 'CLASSIC',
    createIntent: 'social',
  },
  {
    label: 'padel points preset blocked on classic gameType',
    sport: 'PADEL',
    preset: 'POINTS_24',
    legal: false,
    gameType: 'CLASSIC',
    scoringMode: 'POINTS',
  },
  {
    label: 'padel classic preset blocked on points mode',
    sport: 'PADEL',
    preset: 'CLASSIC_BEST_OF_3',
    legal: false,
    scoringMode: 'POINTS',
  },
  {
    label: 'badminton social americano budget',
    sport: 'BADMINTON',
    preset: 'POINTS_21',
    legal: true,
    gameType: 'AMERICANO',
    matchGenerationType: 'RANDOM',
    scoringMode: 'POINTS',
    createIntent: 'social',
  },
  {
    label: 'badminton match bo3 21',
    sport: 'BADMINTON',
    preset: 'BEST_OF_3_21',
    legal: true,
    gameType: 'CLASSIC',
    matchGenerationType: 'AUTOMATIC',
    scoringMode: 'POINTS',
    createIntent: 'match',
  },
  {
    label: 'badminton match intent blocks social-only points',
    sport: 'BADMINTON',
    preset: 'POINTS_21',
    legal: false,
    gameType: 'AMERICANO',
    matchGenerationType: 'RANDOM',
    scoringMode: 'POINTS',
    createIntent: 'match',
  },
  {
    label: 'pickleball social doubles americano',
    sport: 'PICKLEBALL',
    preset: 'POINTS_21',
    legal: true,
    gameType: 'AMERICANO',
    matchGenerationType: 'RANDOM',
    scoringMode: 'POINTS',
    createIntent: 'social',
  },
  {
    label: 'pickleball match bo3 11',
    sport: 'PICKLEBALL',
    preset: 'BEST_OF_3_11',
    legal: true,
    gameType: 'CLASSIC',
    matchGenerationType: 'AUTOMATIC',
    scoringMode: 'POINTS',
    createIntent: 'match',
  },
  {
    label: 'pickleball timed blocked at create',
    sport: 'PICKLEBALL',
    preset: 'TIMED',
    legal: false,
  },
  {
    label: 'table tennis social single game',
    sport: 'TABLE_TENNIS',
    preset: 'POINTS_11',
    legal: true,
    gameType: 'CUSTOM',
    matchGenerationType: 'AUTOMATIC',
    scoringMode: 'POINTS',
    createIntent: 'social',
  },
  {
    label: 'table tennis match bo3 11',
    sport: 'TABLE_TENNIS',
    preset: 'BEST_OF_3_11',
    legal: true,
    gameType: 'CLASSIC',
    matchGenerationType: 'AUTOMATIC',
    scoringMode: 'POINTS',
    createIntent: 'match',
  },
  {
    label: 'table tennis padel-only preset',
    sport: 'TABLE_TENNIS',
    preset: 'POINTS_24',
    legal: false,
  },
  {
    label: 'table tennis social intent blocks match bo5',
    sport: 'TABLE_TENNIS',
    preset: 'BEST_OF_5_11',
    legal: false,
    gameType: 'CLASSIC',
    matchGenerationType: 'AUTOMATIC',
    scoringMode: 'POINTS',
    createIntent: 'social',
  },
];

describe('isPresetLegal', () => {
  it.each(CASES)('$label', ({ sport, preset, legal, ...ctx }) => {
    const config = getSportConfig(Sports[sport]);
    expect(
      isPresetLegal({
        sport: Sports[sport],
        preset,
        allowedScoringPresets: config.allowedScoringPresets,
        presetMeta: config.presetMeta,
        ...ctx,
      }),
    ).toBe(legal);
  });

  it('wizard presets stay legal for backend gameType pairing', () => {
    for (const sport of SPORTS) {
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
        expect(
          isPresetLegal({
            sport,
            preset,
            allowedScoringPresets: config.allowedScoringPresets,
            scoringMode,
            matchGenerationType,
            gameType,
          }),
          `${sport} ${preset}`,
        ).toBe(true);
      }
    }
  });
});
