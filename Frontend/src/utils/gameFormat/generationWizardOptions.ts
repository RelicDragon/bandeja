import type { EntityType, MatchGenerationType } from '@/types';
import type { Sport } from '@shared/sport';
import {
  allowedGenerationsForMaxParticipants,
  allowedGenerationsForSport,
} from './scoringCompatibility';

export const WIZARD_HIDDEN_GENERATIONS: readonly MatchGenerationType[] = ['HANDMADE', 'FIXED'];

type GenerationOptionRule = {
  value: MatchGenerationType;
  entityTypes?: EntityType[];
  minPlayers?: number;
};

const GENERATION_OPTION_RULES: GenerationOptionRule[] = [
  { value: 'AUTOMATIC' },
  { value: 'RANDOM' },
  { value: 'RATING' },
  { value: 'ROUND_ROBIN', minPlayers: 4 },
  {
    value: 'WINNERS_COURT',
    minPlayers: 8,
    entityTypes: ['TOURNAMENT', 'LEAGUE', 'LEAGUE_SEASON'],
  },
  {
    value: 'ESCALERA',
    minPlayers: 8,
    entityTypes: ['TOURNAMENT', 'LEAGUE', 'LEAGUE_SEASON'],
  },
  { value: 'KING_OF_COURT', minPlayers: 8 },
];

export interface WizardGenerationContext {
  entityType: EntityType;
  sport?: Sport;
  playersPerMatch?: number;
  maxParticipants?: number;
  participantCount?: number;
}

export function listWizardSelectableGenerations(ctx: WizardGenerationContext): MatchGenerationType[] {
  const slotCount = ctx.maxParticipants ?? ctx.participantCount ?? 0;
  const allowedOrder =
    ctx.sport != null
      ? allowedGenerationsForSport(
          ctx.sport,
          slotCount > 0 ? slotCount : undefined,
          ctx.playersPerMatch,
        )
      : allowedGenerationsForMaxParticipants(slotCount > 0 ? slotCount : undefined);

  const effectiveEntityType: EntityType =
    ctx.entityType === 'GAME' && slotCount > 4 ? 'TOURNAMENT' : ctx.entityType;
  const countForRules = slotCount > 0 ? slotCount : (ctx.participantCount ?? 0);

  return allowedOrder.filter((value) => {
    if (WIZARD_HIDDEN_GENERATIONS.includes(value)) return false;
    const rule = GENERATION_OPTION_RULES.find((r) => r.value === value);
    if (!rule) return false;
    if (rule.entityTypes && !rule.entityTypes.includes(effectiveEntityType)) return false;
    if (rule.minPlayers && countForRules < rule.minPlayers) return false;
    return true;
  });
}

export function shouldShowGameFormatGenerationStep(
  selectable: MatchGenerationType[],
): boolean {
  if (selectable.length === 0) return false;
  return !(selectable.length === 1 && selectable[0] === 'AUTOMATIC');
}
