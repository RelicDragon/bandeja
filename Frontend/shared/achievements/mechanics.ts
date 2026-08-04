import type { AchievementDefinition } from './types';

/** UNIQUE and MILESTONE definitions can never be re-earned. */
export function isLifetimeAchievement(
  definition: Pick<AchievementDefinition, 'type'>,
): boolean {
  return definition.type === 'UNIQUE' || definition.type === 'MILESTONE';
}

/** REPEATABLE definitions can be earned once for every distinct source. */
export function isRepeatableAchievement(
  definition: Pick<AchievementDefinition, 'type'>,
): boolean {
  return definition.type === 'REPEATABLE';
}
