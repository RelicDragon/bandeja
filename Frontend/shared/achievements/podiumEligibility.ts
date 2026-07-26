import { PODIUM_MIN_PLAYING_PARTICIPANTS, podiumDefinitionForPlace } from './catalog';
import type { AchievementDefinition } from './types';

export type PodiumPlace = 1 | 2 | 3;

export function meetsPodiumParticipantFloor(playingCount: number): boolean {
  return playingCount >= PODIUM_MIN_PLAYING_PARTICIPANTS;
}

export function isPodiumPlace(value: number): value is PodiumPlace {
  return value === 1 || value === 2 || value === 3;
}

/** Group user ids by podium place from outcome positions (ties share a place). */
export function groupUserIdsByPodiumPlace(
  outcomes: ReadonlyArray<{ userId: string; position: number | null | undefined }>,
): Map<PodiumPlace, string[]> {
  const map = new Map<PodiumPlace, string[]>();
  for (const outcome of outcomes) {
    if (outcome.position == null || !isPodiumPlace(outcome.position)) continue;
    const list = map.get(outcome.position) ?? [];
    list.push(outcome.userId);
    map.set(outcome.position, list);
  }
  return map;
}

export function podiumDefinitionForPodiumPlace(place: PodiumPlace): AchievementDefinition {
  return podiumDefinitionForPlace(place);
}

/** Whether this entity type can receive podium grants when its Game is FINAL. */
export function isPodiumEligibleEntityType(
  entityType: string,
  parentId: string | null | undefined,
): boolean {
  if (entityType === 'TOURNAMENT' || entityType === 'LEAGUE_SEASON') return true;
  // Standalone LEAGUE (no season parent) can carry full standings like a tournament.
  if (entityType === 'LEAGUE' && !parentId) return true;
  return false;
}

/**
 * Event-wide podium uses bracket places only for a single tree (CROSS_GROUP, or
 * PER_GROUP with ≤1 group). Multi-group PER_GROUP is division trees → RR standings.
 */
export function usesBracketPlacesForEventPodium(
  bracketScope: string,
  groupCount: number,
): boolean {
  if (bracketScope === 'CROSS_GROUP') return true;
  return groupCount <= 1;
}
