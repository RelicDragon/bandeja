import { ACHIEVEMENT_CATALOG } from './catalog';
import { habitProgressForDefinition, type HabitProgressCounters } from './projectCabinet';
import type { AchievementDefinition } from './types';

/** True when counters alone would unlock this one-shot habit (ignores ownership). */
export function habitThresholdMet(
  definition: AchievementDefinition,
  counters: HabitProgressCounters,
): boolean {
  if (definition.multiplicity !== 'one_shot') return false;
  const progress = habitProgressForDefinition(definition, counters);
  return Boolean(progress && progress.current >= progress.target);
}

/**
 * Habit definitions whose counters meet threshold and are not yet owned.
 * Useful for progress UI; grants must use {@link habitUnlocksNewlyCrossed}.
 */
export function habitUnlocksDue(params: {
  counters: HabitProgressCounters;
  ownedDefinitionIds: ReadonlySet<string>;
}): AchievementDefinition[] {
  return ACHIEVEMENT_CATALOG.filter((definition) => {
    if (definition.multiplicity !== 'one_shot') return false;
    if (params.ownedDefinitionIds.has(definition.id)) return false;
    return habitThresholdMet(definition, params.counters);
  });
}

/**
 * One-shot habits newly crossed on this event (after meets, before did not).
 * Forward-only: no soft backfill from historical counters already above threshold.
 */
export function habitUnlocksNewlyCrossed(params: {
  before: HabitProgressCounters;
  after: HabitProgressCounters;
  ownedDefinitionIds: ReadonlySet<string>;
}): AchievementDefinition[] {
  return ACHIEVEMENT_CATALOG.filter((definition) => {
    if (definition.multiplicity !== 'one_shot') return false;
    if (params.ownedDefinitionIds.has(definition.id)) return false;
    if (!habitThresholdMet(definition, params.after)) return false;
    if (habitThresholdMet(definition, params.before)) return false;
    return true;
  });
}
