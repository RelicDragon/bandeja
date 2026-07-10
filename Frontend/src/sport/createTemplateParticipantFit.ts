import type { GenderTeam, ScoringPreset, EntityType } from '@/types';
import type { Sport } from '@shared/sport';
import { Sports } from '@shared/sport';
import {
  GAME_TYPE_TO_ROTATION,
  ROTATION_BY_SPORT,
  isRotationFormatAllowed,
  isRotationGameType,
  type RotationFormatKey,
} from '@/sport/rotationFormats';
import type { CreateTemplate, CreateTemplateId, FeLegacyPadelTemplateId } from '@/sport/createTemplateUiExtras';
import { CREATE_TEMPLATES, getCreateFlowConfig } from '@/sport/createFlow';

/** Rally / tennis sports where singles and doubles templates can coexist in the picker. */
const FLEXIBLE_MATCH_SIZE_SPORTS = new Set<Sport>([
  Sports.TENNIS,
  Sports.PICKLEBALL,
  Sports.BADMINTON,
  Sports.TABLE_TENNIS,
  Sports.SQUASH,
]);

export type CreateTemplateParticipantContext = {
  maxParticipants: number;
  playersPerMatch: 2 | 4;
  hasFixedTeams: boolean;
  genderTeams?: GenderTeam;
};

function rotationKeyForTemplate(tpl: CreateTemplate): RotationFormatKey | undefined {
  return GAME_TYPE_TO_ROTATION[tpl.gameType];
}

/** Minimum roster for this template to make sense. */
export function minRosterForTemplate(sport: Sport, tpl: CreateTemplate): number {
  const rot = ROTATION_BY_SPORT[sport];
  const floor = rot.minRotationRoster ?? 4;

  if (tpl.gameType === 'ROUND_ROBIN') {
    const target = Math.floor(tpl.suggestedMaxParticipants * 0.75);
    return Math.max(floor, tpl.playersPerMatch === 2 ? Math.max(6, target) : target);
  }

  const rotKey = rotationKeyForTemplate(tpl);
  if (rotKey) {
    if (tpl.gameType === 'LADDER' || tpl.gameType === 'KOTC') {
      return Math.max(floor, tpl.playersPerMatch === 4 ? 8 : 6);
    }
    return floor;
  }
  return tpl.playersPerMatch;
}

/** Upper roster bound for single-fixture / host-a-match templates. */
export function maxRosterForTemplate(tpl: CreateTemplate): number | undefined {
  if (isRotationGameType(tpl.gameType)) return undefined;
  return tpl.suggestedMaxParticipants;
}

export function isCreateTemplateCompatible(
  sport: Sport,
  tpl: CreateTemplate,
  allowedScoringPresets: ScoringPreset[],
  ctx: CreateTemplateParticipantContext,
): boolean {
  if (!allowedScoringPresets.includes(tpl.scoringPreset)) return false;
  if (!FLEXIBLE_MATCH_SIZE_SPORTS.has(sport) && tpl.playersPerMatch !== ctx.playersPerMatch) return false;

  if (ctx.genderTeams === 'MIX_PAIRS' && ctx.playersPerMatch === 2) return false;

  const rotKey = rotationKeyForTemplate(tpl);
  if (rotKey) {
    const rot = ROTATION_BY_SPORT[sport];
    if (!isRotationFormatAllowed(rot, rotKey, ctx.playersPerMatch)) return false;
    if (ctx.hasFixedTeams && (tpl.gameType === 'AMERICANO' || tpl.gameType === 'MEXICANO')) {
      return false;
    }
  }

  const minRoster = minRosterForTemplate(sport, tpl);
  if (ctx.maxParticipants < minRoster) return false;

  const maxRoster = maxRosterForTemplate(tpl);
  if (maxRoster != null && ctx.maxParticipants > maxRoster) return false;

  return true;
}

export function listTemplatesForParticipantSetup(
  sport: Sport,
  allowedScoringPresets: ScoringPreset[],
  ctx: CreateTemplateParticipantContext,
): CreateTemplate[] {
  const ids = getCreateFlowConfig(sport).createTemplates;
  return ids
    .map((id) => CREATE_TEMPLATES[id])
    .filter((tpl) => tpl.sport === sport)
    .filter((tpl) => isCreateTemplateCompatible(sport, tpl, allowedScoringPresets, ctx));
}

export function pickDefaultTemplateId(
  sport: Sport,
  allowedScoringPresets: ScoringPreset[],
  ctx: CreateTemplateParticipantContext,
  preferredId?: CreateTemplateId | null,
  entityType?: EntityType,
): CreateTemplateId | null {
  const list = listTemplatesForParticipantSetup(sport, allowedScoringPresets, ctx);
  if (preferredId && list.some((t) => t.id === preferredId)) return preferredId;
  if (entityType === 'GAME' && sport === Sports.PADEL) {
    if (ctx.playersPerMatch === 2) {
      const singlesDefault: CreateTemplateId = 'PADEL_SINGLES_AUTOMATIC';
      if (list.some((t) => t.id === singlesDefault)) return singlesDefault;
    } else {
      const padelDefault: FeLegacyPadelTemplateId = 'PADEL_AUTOMATIC';
      if (list.some((t) => t.id === padelDefault)) return padelDefault;
    }
  }
  if (entityType === 'LEAGUE') {
    const matchTier = list.find((t) => t.tier === 'match');
    return matchTier?.id ?? list[0]?.id ?? null;
  }
  return list[0]?.id ?? null;
}
