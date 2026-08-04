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
 * Event-wide podium uses bracket places whenever a playoff bracket exists
 * (CROSS_GROUP or PER_GROUP). Multi-group PER_GROUP awards one gold/silver/bronze
 * set per division tree — never RR standings for a bracket season.
 * `groupCount` is retained for callers; it does not change the decision.
 */
export function usesBracketPlacesForEventPodium(
  _bracketScope: string,
  _groupCount: number,
): boolean {
  return true;
}

/**
 * Which bracket trees contribute podium places for a season.
 * CROSS_GROUP: one season tree (`null` group key).
 * PER_GROUP: one tree per league group id (empty group list falls back to `[null]`).
 */
export function treeKeysForBracketPodium(
  bracketScope: string,
  groupIds: readonly string[],
): Array<string | null> {
  if (bracketScope === 'CROSS_GROUP') return [null];
  if (groupIds.length === 0) return [null];
  return [...groupIds];
}

/**
 * Finalist of a single-elim (or resolved DE) final is the side that lost to the
 * champion. Returns null when sides or winner are incomplete/inconsistent.
 */
export function finalistFromChampionshipSides(
  championParticipantId: string | null | undefined,
  sideAParticipantId: string | null | undefined,
  sideBParticipantId: string | null | undefined,
): string | null {
  if (!championParticipantId || !sideAParticipantId || !sideBParticipantId) return null;
  if (championParticipantId === sideAParticipantId) return sideBParticipantId;
  if (championParticipantId === sideBParticipantId) return sideAParticipantId;
  return null;
}

export type TreeBracketPodiumIds = {
  championParticipantId: string | null;
  finalistParticipantId: string | null;
  thirdPlaceParticipantId?: string | null;
};

/**
 * Merges per-tree champion/finalist/third into event-wide place bags.
 * Multi-group PER_GROUP seasons pass one entry per group; CROSS_GROUP passes one.
 * Finalists are place 2 (silver) — one per tree, never inferred from RR standings.
 */
export function mergeTreePodiumsIntoEventPlaces(
  trees: readonly TreeBracketPodiumIds[],
): Map<PodiumPlace, string[]> {
  const placeToParticipants = new Map<PodiumPlace, string[]>();
  const push = (place: PodiumPlace, id: string | null | undefined) => {
    if (!id) return;
    const list = placeToParticipants.get(place) ?? [];
    if (!list.includes(id)) list.push(id);
    placeToParticipants.set(place, list);
  };
  for (const tree of trees) {
    if (!tree.championParticipantId) continue;
    push(1, tree.championParticipantId);
    push(2, tree.finalistParticipantId);
    push(3, tree.thirdPlaceParticipantId ?? null);
  }
  return placeToParticipants;
}
