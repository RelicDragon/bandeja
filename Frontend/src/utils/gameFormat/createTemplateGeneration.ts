import type { MatchGenerationType } from '@/types';
import type { CreateTemplate } from '@/sport/createFlow';

/** <= 5 players: automatic matches; otherwise Americano-style random rotation. */
export function resolveCreateTemplateGeneration(
  template: CreateTemplate,
  maxParticipants: number | undefined,
): MatchGenerationType {
  if (maxParticipants != null && maxParticipants <= 5) return 'AUTOMATIC';
  if (template.gameType === 'AMERICANO' || template.inlineConfig?.type === 'points_total') return 'RANDOM';
  return 'RANDOM';
}

export function isAmericanoGeneration(gen: MatchGenerationType): boolean {
  return gen === 'RANDOM';
}
