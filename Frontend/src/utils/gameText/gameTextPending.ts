import type { GameLocalizedTextProjection } from './gameLocalizedText.types';

/** True when any projected field is still waiting on translation work. */
export function isGameTextTranslationPending(
  projection: GameLocalizedTextProjection | null | undefined,
): boolean {
  if (!projection) return false;
  return projection.name.state === 'pending' || projection.description.state === 'pending';
}
