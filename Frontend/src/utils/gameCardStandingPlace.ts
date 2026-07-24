export type StandingMedalMode = 'winner' | 'podium';

export type StandingPlaceVisual = 'gold' | 'silver' | 'bronze' | 'number';

/** Tournament → podium medals; normal match cards → gold for 1st only. */
export function resolveStandingMedalMode(entityType: string | null | undefined): StandingMedalMode {
  return entityType === 'TOURNAMENT' ? 'podium' : 'winner';
}

/**
 * Place visual for GameCard standings.
 * Ties share the same place number → same visual (e.g. two golds when both are 1).
 */
export function resolveStandingPlaceVisual(
  place: number,
  mode: StandingMedalMode
): StandingPlaceVisual {
  if (!Number.isFinite(place) || place < 1) return 'number';
  if (place === 1) return 'gold';
  if (mode === 'podium' && place === 2) return 'silver';
  if (mode === 'podium' && place === 3) return 'bronze';
  return 'number';
}
