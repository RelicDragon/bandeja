import type { AchievementDefinition } from './types';
import { isLifetimeAchievement } from './mechanics';

export const GIANT_KILLER_THRESHOLDS = [1, 5, 10, 25, 50] as const;
export const DYNAMIC_DUO_THRESHOLDS = [10, 50, 100] as const;
export const OPEN_COURT_THRESHOLDS = [10, 25, 50, 100, 250] as const;

export const GIANT_KILLER_MIN_LEVEL_GAP = 0.5;
export const GIANT_KILLER_MIN_RELIABILITY = 10;

export type PartnerHabitRuleKind =
  | 'HABIT_GIANT_KILLER'
  | 'HABIT_DYNAMIC_DUO'
  | 'HABIT_OPEN_COURT';

export function filterThresholdDefinitionsDue(params: {
  definitions: readonly AchievementDefinition[];
  ruleKind: PartnerHabitRuleKind;
  before: number;
  after: number;
  ownedDefinitionIds: ReadonlySet<string>;
}): AchievementDefinition[] {
  return params.definitions.filter((definition) => {
    if (definition.ruleKind !== params.ruleKind) return false;
    if (!isLifetimeAchievement(definition)) return false;
    if (params.ownedDefinitionIds.has(definition.id)) return false;
    const target = definition.threshold;
    if (target == null || target <= 0) return false;
    if (params.after < target) return false;
    if (params.before >= target) return false;
    return true;
  });
}
