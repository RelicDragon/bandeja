import { Sports, type Sport } from '@shared/sport';

export type SportRatingDisplaySystem =
  | 'PLAYTOMIC'
  | 'NTRP'
  | 'DUPR'
  | 'UTR'
  | 'USATT'
  | 'SQUASHLEVELS'
  | 'NONE';

export type SportRatingModel = {
  id: 'bandeja_elo_v1';
  canonical: { min: number; max: number };
  questionnaireId?: string;
  levelBands: Array<{ min: number; max: number; labelKey: string; hintKey?: string }>;
  engine: {
    maxDeltaPerEvent?: number;
    useScoreMargin: boolean;
    ballsInGamesMargin?: boolean;
  };
  ratesWhen: { affectsRatingTrue: boolean };
  display?: {
    system: SportRatingDisplaySystem;
    mapLevelToHint?: (level: number) => string;
  };
  external?: { provider?: string; profileField?: string };
};

const LEVEL_BANDS_6: SportRatingModel['levelBands'] = [
  { min: 1.0, max: 2.0, labelKey: 'sportRating.band.beginner' },
  { min: 2.0, max: 3.0, labelKey: 'sportRating.band.improver' },
  { min: 3.0, max: 4.0, labelKey: 'sportRating.band.intermediate' },
  { min: 4.0, max: 5.0, labelKey: 'sportRating.band.advanced' },
  { min: 5.0, max: 6.0, labelKey: 'sportRating.band.expert' },
  { min: 6.0, max: 7.0, labelKey: 'sportRating.band.elite' },
];

export const SPORT_RATING_MODELS: Record<Sport, SportRatingModel> = {
  [Sports.PADEL]: {
    id: 'bandeja_elo_v1',
    canonical: { min: 1.0, max: 7.0 },
    questionnaireId: 'padel-v1',
    levelBands: LEVEL_BANDS_6.map((b, i) => ({
      ...b,
      hintKey: `sportRating.padel.band${i + 1}`,
    })),
    engine: { maxDeltaPerEvent: 0.2, useScoreMargin: true, ballsInGamesMargin: true },
    ratesWhen: { affectsRatingTrue: true },
    display: { system: 'PLAYTOMIC' },
    external: { provider: 'playtomic', profileField: 'externalRatingHint' },
  },
  [Sports.TENNIS]: {
    id: 'bandeja_elo_v1',
    canonical: { min: 1.0, max: 7.0 },
    questionnaireId: 'tennis-v1',
    levelBands: LEVEL_BANDS_6,
    engine: { maxDeltaPerEvent: 0.2, useScoreMargin: true },
    ratesWhen: { affectsRatingTrue: true },
    display: { system: 'NTRP' },
    external: { profileField: 'externalRatingHint' },
  },
  [Sports.PICKLEBALL]: {
    id: 'bandeja_elo_v1',
    canonical: { min: 1.0, max: 7.0 },
    questionnaireId: 'pickleball-v1',
    levelBands: LEVEL_BANDS_6,
    engine: { maxDeltaPerEvent: 0.2, useScoreMargin: true },
    ratesWhen: { affectsRatingTrue: true },
    display: { system: 'DUPR' },
    external: { provider: 'dupr', profileField: 'externalRatingHint' },
  },
  [Sports.BADMINTON]: {
    id: 'bandeja_elo_v1',
    canonical: { min: 1.0, max: 7.0 },
    questionnaireId: 'badminton-v1',
    levelBands: LEVEL_BANDS_6,
    engine: { maxDeltaPerEvent: 0.2, useScoreMargin: true },
    ratesWhen: { affectsRatingTrue: true },
    display: { system: 'NONE' },
  },
  [Sports.TABLE_TENNIS]: {
    id: 'bandeja_elo_v1',
    canonical: { min: 1.0, max: 7.0 },
    questionnaireId: 'table-tennis-v1',
    levelBands: LEVEL_BANDS_6,
    engine: { maxDeltaPerEvent: 0.2, useScoreMargin: true },
    ratesWhen: { affectsRatingTrue: true },
    display: { system: 'USATT' },
    external: { profileField: 'externalRatingHint' },
  },
  [Sports.SQUASH]: {
    id: 'bandeja_elo_v1',
    canonical: { min: 1.0, max: 7.0 },
    questionnaireId: 'squash-v1',
    levelBands: LEVEL_BANDS_6,
    engine: { maxDeltaPerEvent: 0.2, useScoreMargin: true },
    ratesWhen: { affectsRatingTrue: true },
    display: { system: 'SQUASHLEVELS' },
    external: { provider: 'squashlevels', profileField: 'externalRatingHint' },
  },
};

export function sportSupportsExternalRatingHint(sport: Sport): boolean {
  const system = SPORT_RATING_MODELS[sport].display?.system;
  return system !== undefined && system !== 'NONE';
}

export function getSportRatingModel(sport: Sport): SportRatingModel {
  return SPORT_RATING_MODELS[sport];
}
