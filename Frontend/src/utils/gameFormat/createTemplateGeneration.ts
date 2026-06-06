import type { MatchGenerationType } from '@/types';
import type { CreateTemplate } from '@/sport/createFlow';
import { getGameTypeTemplate } from '@/utils/gameTypeTemplates';

function fallbackFromGameType(template: CreateTemplate): MatchGenerationType {
  if (template.gameType === 'AMERICANO' || template.inlineConfig?.type === 'points_total') {
    return 'RANDOM';
  }
  return getGameTypeTemplate(template.gameType).matchGenerationType;
}

/** <= 5 players: automatic matches; otherwise honor template metadata. */
export function resolveCreateTemplateGeneration(
  template: CreateTemplate,
  maxParticipants: number | undefined,
): MatchGenerationType {
  if (maxParticipants != null && maxParticipants <= 5) return 'AUTOMATIC';
  return template.matchGenerationType ?? fallbackFromGameType(template);
}

export function isAmericanoGeneration(gen: MatchGenerationType): boolean {
  return gen === 'RANDOM';
}
