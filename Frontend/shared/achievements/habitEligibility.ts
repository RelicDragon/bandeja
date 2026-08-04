import { ACHIEVEMENT_CATALOG } from './catalog';
import { isLifetimeAchievement } from './mechanics';
import { habitProgressForDefinition, type HabitProgressCounters } from './projectCabinet';
import type { AchievementDefinition, TrophyRuleKind } from './types';

/** Play-habit rule kinds granted via results apply (not organize/partner services). */
const PLAY_HABIT_RULE_KINDS: ReadonlySet<TrophyRuleKind> = new Set([
  'HABIT_STREAK',
  'HABIT_VOLUME',
  'HABIT_FIRST_WIN',
  'HABIT_WINS',
  'HABIT_SPORT_VOLUME',
]);

function isOneShotWithProgress(definition: AchievementDefinition): boolean {
  return isLifetimeAchievement(definition);
}

function isPlayHabit(definition: AchievementDefinition): boolean {
  return isOneShotWithProgress(definition) && PLAY_HABIT_RULE_KINDS.has(definition.ruleKind);
}

/** True when counters alone would unlock this lifetime habit (ignores ownership). */
export function habitThresholdMet(
  definition: AchievementDefinition,
  counters: HabitProgressCounters,
): boolean {
  if (!isOneShotWithProgress(definition)) return false;
  const progress = habitProgressForDefinition(definition, counters);
  return Boolean(progress && progress.current >= progress.target);
}

/**
 * Habit definitions whose counters meet threshold and are not yet owned.
 * Includes organize/partner (used by ops backfill). Live play grants use
 * {@link habitUnlocksNewlyCrossed} instead.
 */
export function habitUnlocksDue(params: {
  counters: HabitProgressCounters;
  ownedDefinitionIds: ReadonlySet<string>;
}): AchievementDefinition[] {
  return ACHIEVEMENT_CATALOG.filter((definition) => {
    if (!isOneShotWithProgress(definition)) return false;
    if (params.ownedDefinitionIds.has(definition.id)) return false;
    return habitThresholdMet(definition, params.counters);
  });
}

/**
 * Play habits newly crossed on this event (after meets, before did not).
 * Forward-only: no soft backfill from historical counters already above threshold.
 * Organize/partner are excluded — dedicated grant services own those ladders.
 */
export function habitUnlocksNewlyCrossed(params: {
  before: HabitProgressCounters;
  after: HabitProgressCounters;
  ownedDefinitionIds: ReadonlySet<string>;
}): AchievementDefinition[] {
  return ACHIEVEMENT_CATALOG.filter((definition) => {
    if (!isPlayHabit(definition)) return false;
    if (params.ownedDefinitionIds.has(definition.id)) return false;
    if (!habitThresholdMet(definition, params.after)) return false;
    if (habitThresholdMet(definition, params.before)) return false;
    return true;
  });
}
