import type { EntityType } from '@/types';

/**
 * Length a game gets until someone picks one (new game, or a game without a
 * time yet). League fixtures are one hour — the same as the server creates
 * them (`Backend/src/services/league/gameCreation.util.ts`); everything else two.
 */
export function defaultGameDurationHours(entityType: EntityType | null | undefined): number {
  return entityType === 'LEAGUE' || entityType === 'LEAGUE_SEASON' ? 1 : 2;
}
