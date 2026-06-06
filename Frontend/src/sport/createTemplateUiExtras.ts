import type { GameType, MatchGenerationType, ScoringPreset } from '@/types';
import { Sports } from '@shared/sport';
import {
  CREATE_TEMPLATES as SHARED_CREATE_TEMPLATES,
  type CreateTemplateId as SharedCreateTemplateId,
  type CreateTemplate as SharedCreateTemplate,
} from '@shared/createTemplates';

export type CreateTemplateInlineConfig =
  | { type: 'points_total' }
  | { type: 'timed_duration'; options: readonly number[] };

export type FeCreateTemplateExtras = {
  labelKey: string;
  descriptionKey?: string;
  baselineRounds?: number;
  inlineConfig?: CreateTemplateInlineConfig;
  badgeLabelKey?: string;
  badgeVariant?: 'social' | 'match' | 'official';
};

export type FeLegacyPadelTemplateId =
  | 'PADEL_BEST_OF_3'
  | 'PADEL_SINGLE_SET'
  | 'PADEL_AMERICANO'
  | 'PADEL_TIMED';

export type FeCreateTemplate = SharedCreateTemplate &
  FeCreateTemplateExtras & {
    scoringPreset: ScoringPreset;
    gameType: GameType;
    matchGenerationType: MatchGenerationType;
  };

export type CreateTemplateId = SharedCreateTemplateId | FeLegacyPadelTemplateId;

export type CreateTemplate = FeCreateTemplate;

export const SHARED_TEMPLATE_UI_EXTRAS: Record<SharedCreateTemplateId, FeCreateTemplateExtras> = {
  PADEL_AMERICANO_10: {
    labelKey: 'createGame.templates.PADEL_AMERICANO_10.title',
    descriptionKey: 'createGame.templates.PADEL_AMERICANO_10.description',
    baselineRounds: 6,
  },
  PADEL_AMERICANO_24: {
    labelKey: 'createGame.templates.PADEL_AMERICANO_24.title',
    descriptionKey: 'createGame.templates.PADEL_AMERICANO_24.description',
    baselineRounds: 6,
  },
  PADEL_AMERICANO_20: {
    labelKey: 'createGame.templates.PADEL_AMERICANO_20.title',
    descriptionKey: 'createGame.templates.PADEL_AMERICANO_20.description',
    baselineRounds: 6,
  },
  PADEL_MEXICANO_24: {
    labelKey: 'createGame.templates.PADEL_MEXICANO_24.title',
    descriptionKey: 'createGame.templates.PADEL_MEXICANO_24.description',
    baselineRounds: 6,
  },
  PADEL_CHALLENGER_POOL: {
    labelKey: 'createGame.templates.PADEL_CHALLENGER_POOL.title',
    descriptionKey: 'createGame.templates.PADEL_CHALLENGER_POOL.description',
    baselineRounds: 8,
  },
  PADEL_KOTC_11: {
    labelKey: 'createGame.templates.PADEL_KOTC_11.title',
    descriptionKey: 'createGame.templates.PADEL_KOTC_11.description',
    baselineRounds: 8,
  },
  PICKLEBALL_SOCIAL_21: {
    labelKey: 'createGame.templates.PICKLEBALL_SOCIAL_21.title',
    descriptionKey: 'createGame.templates.PICKLEBALL_SOCIAL_21.description',
    baselineRounds: 6,
  },
  PICKLEBALL_MATCH_BO3_11: {
    labelKey: 'createGame.templates.PICKLEBALL_MATCH_BO3_11.title',
    descriptionKey: 'createGame.templates.PICKLEBALL_MATCH_BO3_11.description',
    baselineRounds: 1,
  },
  PICKLEBALL_KOTC_11: {
    labelKey: 'createGame.templates.PICKLEBALL_KOTC_11.title',
    descriptionKey: 'createGame.templates.PICKLEBALL_KOTC_11.description',
    baselineRounds: 8,
  },
  BADMINTON_CLUB_3X21: {
    labelKey: 'createGame.templates.BADMINTON_CLUB_3X21.title',
    descriptionKey: 'createGame.templates.BADMINTON_CLUB_3X21.description',
    baselineRounds: 1,
  },
  BADMINTON_CLUB_3X15: {
    labelKey: 'createGame.templates.BADMINTON_CLUB_3X15.title',
    descriptionKey: 'createGame.templates.BADMINTON_CLUB_3X15.description',
    baselineRounds: 1,
  },
  BADMINTON_AMERICANO_21: {
    labelKey: 'createGame.templates.BADMINTON_AMERICANO_21.title',
    descriptionKey: 'createGame.templates.BADMINTON_AMERICANO_21.description',
    baselineRounds: 6,
  },
  BADMINTON_MATCH_3X21: {
    labelKey: 'createGame.templates.BADMINTON_MATCH_3X21.title',
    descriptionKey: 'createGame.templates.BADMINTON_MATCH_3X21.description',
    baselineRounds: 1,
  },
  TT_OPEN_PLAY_11: {
    labelKey: 'createGame.templates.TT_OPEN_PLAY_11.title',
    descriptionKey: 'createGame.templates.TT_OPEN_PLAY_11.description',
    baselineRounds: 1,
  },
  TT_CLUB_RR_11: {
    labelKey: 'createGame.templates.TT_CLUB_RR_11.title',
    descriptionKey: 'createGame.templates.TT_CLUB_RR_11.description',
    baselineRounds: 7,
  },
  TT_LEGACY_SINGLE_21: {
    labelKey: 'createGame.templates.TT_LEGACY_SINGLE_21.title',
    descriptionKey: 'createGame.templates.TT_LEGACY_SINGLE_21.description',
    baselineRounds: 1,
  },
  TT_BOX_BO3_11: {
    labelKey: 'createGame.templates.TT_BOX_BO3_11.title',
    descriptionKey: 'createGame.templates.TT_BOX_BO3_11.description',
    baselineRounds: 7,
  },
  TT_MATCH_BO3_11: {
    labelKey: 'createGame.templates.TT_MATCH_BO3_11.title',
    descriptionKey: 'createGame.templates.TT_MATCH_BO3_11.description',
    baselineRounds: 1,
  },
  TT_MATCH_BO5_11: {
    labelKey: 'createGame.templates.TT_MATCH_BO5_11.title',
    descriptionKey: 'createGame.templates.TT_MATCH_BO5_11.description',
    baselineRounds: 1,
  },
  TT_AMERICANO_11: {
    labelKey: 'createGame.templates.TT_AMERICANO_11.title',
    descriptionKey: 'createGame.templates.TT_AMERICANO_11.description',
    baselineRounds: 6,
  },
  TT_MEXICANO_11: {
    labelKey: 'createGame.templates.TT_MEXICANO_11.title',
    descriptionKey: 'createGame.templates.TT_MEXICANO_11.description',
    baselineRounds: 6,
  },
  TT_SWISS_BOX: {
    labelKey: 'createGame.templates.TT_SWISS_BOX.title',
    descriptionKey: 'createGame.templates.TT_SWISS_BOX.description',
    baselineRounds: 7,
  },
  TENNIS_FAST4_SOCIAL: {
    labelKey: 'createGame.templates.TENNIS_FAST4_SOCIAL.title',
    descriptionKey: 'createGame.templates.TENNIS_FAST4_SOCIAL.description',
    baselineRounds: 1,
  },
  TENNIS_CLASSIC_BO3: {
    labelKey: 'createGame.templates.TENNIS_CLASSIC_BO3.title',
    descriptionKey: 'createGame.templates.TENNIS_CLASSIC_BO3.description',
    baselineRounds: 1,
  },
  SQUASH_QUICK_BO3_11: {
    labelKey: 'createGame.templates.SQUASH_QUICK_BO3_11.title',
    descriptionKey: 'createGame.templates.SQUASH_QUICK_BO3_11.description',
    baselineRounds: 1,
  },
};

export const FE_LEGACY_PADEL_TEMPLATES: Record<FeLegacyPadelTemplateId, FeCreateTemplate> = {
  PADEL_BEST_OF_3: {
    id: 'PADEL_BEST_OF_3',
    sport: Sports.PADEL,
    tier: 'match',
    labelKey: 'createGame.templates.PADEL_BEST_OF_3.title',
    descriptionKey: 'createGame.templates.PADEL_BEST_OF_3.description',
    badgeLabelKey: 'createGame.templates.PADEL_BEST_OF_3.badge',
    badgeVariant: 'official',
    scoringPreset: 'CLASSIC_BEST_OF_3',
    gameType: 'CLASSIC',
    matchGenerationType: 'AUTOMATIC',
    playersPerMatch: 4,
    suggestedMaxParticipants: 16,
    suggestedCourts: 4,
    affectsRating: true,
    baselineRounds: 1,
  },
  PADEL_SINGLE_SET: {
    id: 'PADEL_SINGLE_SET',
    sport: Sports.PADEL,
    tier: 'match',
    labelKey: 'createGame.templates.PADEL_SINGLE_SET.title',
    descriptionKey: 'createGame.templates.PADEL_SINGLE_SET.description',
    scoringPreset: 'CLASSIC_SINGLE_SET',
    gameType: 'CLASSIC',
    matchGenerationType: 'AUTOMATIC',
    playersPerMatch: 4,
    suggestedMaxParticipants: 16,
    suggestedCourts: 4,
    affectsRating: true,
    baselineRounds: 1,
  },
  PADEL_AMERICANO: {
    id: 'PADEL_AMERICANO',
    sport: Sports.PADEL,
    tier: 'social',
    labelKey: 'createGame.templates.PADEL_AMERICANO.title',
    descriptionKey: 'createGame.templates.PADEL_AMERICANO.description',
    scoringPreset: 'POINTS_24',
    gameType: 'AMERICANO',
    matchGenerationType: 'RANDOM',
    playersPerMatch: 4,
    suggestedMaxParticipants: 16,
    suggestedCourts: 4,
    affectsRating: false,
    baselineRounds: 6,
    inlineConfig: { type: 'points_total' },
  },
  PADEL_TIMED: {
    id: 'PADEL_TIMED',
    sport: Sports.PADEL,
    tier: 'social',
    labelKey: 'createGame.templates.PADEL_TIMED.title',
    descriptionKey: 'createGame.templates.PADEL_TIMED.description',
    scoringPreset: 'CLASSIC_TIMED',
    gameType: 'CLASSIC',
    matchGenerationType: 'AUTOMATIC',
    playersPerMatch: 4,
    suggestedMaxParticipants: 16,
    suggestedCourts: 4,
    affectsRating: false,
    matchTimerEnabled: true,
    matchTimedCapMinutes: 15,
    baselineRounds: 1,
    inlineConfig: { type: 'timed_duration', options: [10, 15, 20] },
  },
};

export function mergeSharedCreateTemplate(id: SharedCreateTemplateId): FeCreateTemplate {
  return {
    ...SHARED_CREATE_TEMPLATES[id],
    ...SHARED_TEMPLATE_UI_EXTRAS[id],
  } as FeCreateTemplate;
}

export function buildFeCreateTemplates(): Record<CreateTemplateId, FeCreateTemplate> {
  const shared = Object.fromEntries(
    (Object.keys(SHARED_CREATE_TEMPLATES) as SharedCreateTemplateId[]).map((id) => [
      id,
      mergeSharedCreateTemplate(id),
    ]),
  ) as Record<SharedCreateTemplateId, FeCreateTemplate>;
  return { ...shared, ...FE_LEGACY_PADEL_TEMPLATES };
}
