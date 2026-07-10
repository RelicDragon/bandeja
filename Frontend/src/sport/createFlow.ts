import type { EntityType, ScoringPreset } from '@/types';
import { isSportCreatable } from '@/config/multisportFlags';
import { ALL_SPORTS, Sports, isSport, type Sport } from '@shared/sport';
import {
  listTemplatesForParticipantSetup,
  type CreateTemplateParticipantContext,
} from '@/sport/createTemplateParticipantFit';
import {
  buildFeCreateTemplates,
  type CreateTemplate,
  type CreateTemplateId,
} from '@/sport/createTemplateUiExtras';
import {
  parseGameOfficiatingLevel,
  resolveOfficiatingLevel,
  type OfficiatingLevel,
} from '@shared/officiatingLevel';
import type { PresetTier, SportPresetMeta, StrictValidationId } from '@shared/createTemplates';

export type { PresetTier, SportPresetMeta, StrictValidationId } from '@shared/createTemplates';
export type { CreateTemplate, CreateTemplateId, CreateTemplateInlineConfig } from '@/sport/createTemplateUiExtras';

export type CreateFlowIntent = 'social' | 'match' | 'advanced';

export type SportCreateFlowConfig = {
  presetMeta: SportPresetMeta[];
  createTemplates: CreateTemplateId[];
};

export const SOCIAL_LEVEL_BAND: [number, number] = [2.0, 5.0];

export const CREATE_TEMPLATES: Record<CreateTemplateId, CreateTemplate> = buildFeCreateTemplates();

function meta(
  preset: ScoringPreset,
  tier: PresetTier,
  labelKey: string,
  defaultFor?: 'social' | 'match',
  strictValidation?: StrictValidationId,
  officiatingLevel?: OfficiatingLevel,
): SportPresetMeta {
  return { preset, tier, labelKey, defaultFor, strictValidation, officiatingLevel };
}

export const CREATE_FLOW_BY_SPORT: Record<Sport, SportCreateFlowConfig> = {
  [Sports.PADEL]: {
    presetMeta: [
      meta('CLASSIC_AUTOMATIC', 'match', 'createGame.presetMeta.CLASSIC_AUTOMATIC', 'match', 'CLASSIC_AUTOMATIC_RELAXED'),
      meta('POINTS_11', 'social', 'createGame.presetMeta.POINTS_11'),
      meta('POINTS_16', 'social', 'createGame.presetMeta.POINTS_16'),
      meta('POINTS_21', 'social', 'createGame.presetMeta.POINTS_21'),
      meta('POINTS_24', 'social', 'createGame.presetMeta.POINTS_24', 'social'),
      meta('POINTS_32', 'social', 'createGame.presetMeta.POINTS_32'),
      meta('CLASSIC_BEST_OF_3', 'match', 'createGame.presetMeta.CLASSIC_BEST_OF_3', 'match', undefined, 'strict'),
      meta('CLASSIC_BEST_OF_5', 'match', 'createGame.presetMeta.CLASSIC_BEST_OF_5'),
      meta('CLASSIC_PRO_SET', 'match', 'createGame.presetMeta.CLASSIC_PRO_SET'),
      meta('CLASSIC_SHORT_SET', 'match', 'createGame.presetMeta.CLASSIC_SHORT_SET'),
      meta('CLASSIC_SINGLE_SET', 'match', 'createGame.presetMeta.CLASSIC_SINGLE_SET'),
      meta('CLASSIC_SUPER_TIEBREAK', 'match', 'createGame.presetMeta.CLASSIC_SUPER_TIEBREAK'),
      meta('CLASSIC_TIMED', 'both', 'createGame.presetMeta.CLASSIC_TIMED', undefined, 'CLASSIC_TIMED_RELAXED'),
      meta('TIMED', 'social', 'createGame.presetMeta.TIMED'),
      meta('CUSTOM', 'both', 'createGame.presetMeta.CUSTOM'),
    ],
    createTemplates: [
      'PADEL_AUTOMATIC',
      'PADEL_BEST_OF_3',
      'PADEL_SINGLE_SET',
      'PADEL_AMERICANO',
      'PADEL_TIMED',
      'PADEL_SINGLES_AUTOMATIC',
      'PADEL_SINGLES_BO3',
      'PADEL_SINGLES_SINGLE_SET',
      'PADEL_SINGLES_AMERICANO_24',
    ],
  },
  [Sports.TENNIS]: {
    presetMeta: [
      meta('CLASSIC_BEST_OF_3', 'match', 'createGame.presetMeta.CLASSIC_BEST_OF_3', 'match', undefined, 'strict'),
      meta('CLASSIC_TIMED', 'social', 'createGame.presetMeta.CLASSIC_TIMED', 'social', 'CLASSIC_TIMED_RELAXED'),
      meta('TIMED', 'social', 'createGame.presetMeta.TIMED'),
      meta('CLASSIC_BEST_OF_5', 'match', 'createGame.presetMeta.CLASSIC_BEST_OF_5'),
      meta('CLASSIC_PRO_SET', 'match', 'createGame.presetMeta.CLASSIC_PRO_SET'),
      meta('CLASSIC_SHORT_SET', 'match', 'createGame.presetMeta.CLASSIC_SHORT_SET'),
      meta('CLASSIC_SINGLE_SET', 'match', 'createGame.presetMeta.CLASSIC_SINGLE_SET'),
      meta('CLASSIC_SUPER_TIEBREAK', 'match', 'createGame.presetMeta.CLASSIC_SUPER_TIEBREAK'),
      meta('CUSTOM', 'both', 'createGame.presetMeta.CUSTOM'),
    ],
    createTemplates: ['TENNIS_FAST4_SOCIAL', 'TENNIS_CLASSIC_BO3'],
  },
  [Sports.PICKLEBALL]: {
    presetMeta: [
      meta('POINTS_16', 'social', 'createGame.presetMeta.POINTS_16'),
      meta('POINTS_21', 'social', 'createGame.presetMeta.POINTS_21', 'social'),
      meta('POINTS_24', 'social', 'createGame.presetMeta.POINTS_24'),
      meta('POINTS_32', 'social', 'createGame.presetMeta.POINTS_32'),
      meta('BEST_OF_3_11', 'match', 'createGame.presetMeta.BEST_OF_3_11', 'match', 'PICKLEBALL_RALLY_11', 'strict'),
      meta('CUSTOM', 'both', 'createGame.presetMeta.CUSTOM'),
    ],
    createTemplates: ['PICKLEBALL_SOCIAL_21', 'PICKLEBALL_MATCH_BO3_11', 'PICKLEBALL_KOTC_11'],
  },
  [Sports.BADMINTON]: {
    presetMeta: [
      meta('POINTS_21', 'social', 'createGame.presetMeta.POINTS_21', 'social'),
      meta('POINTS_15', 'social', 'createGame.presetMeta.POINTS_15', 'social'),
      meta('BEST_OF_3_21', 'match', 'createGame.presetMeta.BEST_OF_3_21', 'match', 'BWF_21', 'strict'),
      meta('BEST_OF_3_15', 'both', 'createGame.presetMeta.BEST_OF_3_15', undefined, 'BWF_15'),
      meta('CUSTOM', 'both', 'createGame.presetMeta.CUSTOM'),
    ],
    createTemplates: [
      'BADMINTON_AMERICANO_21',
      'BADMINTON_CLUB_3X21',
      'BADMINTON_CLUB_3X15',
      'BADMINTON_MATCH_3X21',
    ],
  },
  [Sports.TABLE_TENNIS]: {
    presetMeta: [
      meta('POINTS_11', 'social', 'createGame.presetMeta.POINTS_11'),
      meta('SINGLE_GAME_21', 'social', 'createGame.presetMeta.SINGLE_GAME_21'),
      meta('BEST_OF_3_11', 'both', 'createGame.presetMeta.BEST_OF_3_11', 'match'),
      meta('BEST_OF_5_11', 'match', 'createGame.presetMeta.BEST_OF_5_11', 'match'),
      meta('CUSTOM', 'both', 'createGame.presetMeta.CUSTOM'),
    ],
    createTemplates: [
      'TT_OPEN_PLAY_11',
      'TT_CLUB_RR_11',
      'TT_BOX_BO3_11',
      'TT_LEGACY_SINGLE_21',
      'TT_MATCH_BO3_11',
      'TT_MATCH_BO5_11',
    ],
  },
  [Sports.SQUASH]: {
    presetMeta: [
      meta('BEST_OF_5_11', 'match', 'createGame.presetMeta.BEST_OF_5_11', 'match'),
      meta('BEST_OF_3_11', 'match', 'createGame.presetMeta.BEST_OF_3_11'),
      meta('CUSTOM', 'both', 'createGame.presetMeta.CUSTOM'),
    ],
    createTemplates: ['SQUASH_QUICK_BO3_11'],
  },
};

export function getStrictValidationForPreset(
  sport: Sport | string | null | undefined,
  preset: ScoringPreset | string | null | undefined,
): StrictValidationId {
  if (!sport || !preset || !isSport(sport)) return 'NONE';
  const row = CREATE_FLOW_BY_SPORT[sport].presetMeta.find((m) => m.preset === preset);
  return row?.strictValidation ?? 'NONE';
}

export function getOfficiatingLevelForGame(
  sport: Sport | string | null | undefined,
  preset: ScoringPreset | string | null | undefined,
  metadata?: unknown,
): OfficiatingLevel {
  if (!sport || !preset || !isSport(sport)) return 'none';
  const row = CREATE_FLOW_BY_SPORT[sport].presetMeta.find((m) => m.preset === preset);
  return resolveOfficiatingLevel({
    sport,
    preset,
    presetMetaOfficiating: row?.officiatingLevel,
    presetMetaTier: row?.tier,
    gameOfficiatingLevel: parseGameOfficiatingLevel(metadata),
  });
}

export { type OfficiatingLevel } from '@shared/officiatingLevel';

export function isCasualCreateFlowEnabled(entityType: EntityType): boolean {
  if (entityType !== 'GAME' && entityType !== 'LEAGUE') return false;
  return ALL_SPORTS.filter((s) => isSportCreatable(s)).length > 1;
}

export function getCreateFlowConfig(sport: Sport): SportCreateFlowConfig {
  return CREATE_FLOW_BY_SPORT[sport];
}

export function getTemplate(id: CreateTemplateId): CreateTemplate {
  return CREATE_TEMPLATES[id];
}

export function listTemplatesForIntent(
  sport: Sport,
  intent: 'social' | 'match',
  allowedScoringPresets: ScoringPreset[],
  ctx?: CreateTemplateParticipantContext,
): CreateTemplate[] {
  const base = ctx
    ? listTemplatesForParticipantSetup(sport, allowedScoringPresets, ctx)
    : listTemplatesForSport(sport, allowedScoringPresets);
  return base.filter((tpl) => tpl.tier === intent);
}

export {
  listTemplatesForParticipantSetup,
  pickDefaultTemplateId,
  isCreateTemplateCompatible,
  type CreateTemplateParticipantContext,
} from '@/sport/createTemplateParticipantFit';

export { inferPresetTier, presetTierMap } from '@shared/isPresetLegal';

export function listTemplatesForSport(
  sport: Sport,
  allowedScoringPresets: ScoringPreset[],
): CreateTemplate[] {
  const ids = getCreateFlowConfig(sport).createTemplates;
  return ids
    .map((id) => CREATE_TEMPLATES[id])
    .filter((tpl) => tpl.sport === sport)
    .filter((tpl) => allowedScoringPresets.includes(tpl.scoringPreset));
}
