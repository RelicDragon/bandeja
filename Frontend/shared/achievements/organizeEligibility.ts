import type { AchievementDefinition } from './types';

/** Organizer habit families (one-shot ladders). */
export type OrganizeHabitKind = 'GAME' | 'TOURNAMENT' | 'BAR';

export const ORGANIZE_GAME_THRESHOLDS = [1, 10, 25, 50, 100, 500] as const;
export const ORGANIZE_TOURNAMENT_THRESHOLDS = [1, 5, 10, 25, 50, 100] as const;
export const ORGANIZE_BAR_THRESHOLDS = [1, 5, 10, 25, 50, 100] as const;

export function organizeRuleKindFor(
  kind: OrganizeHabitKind,
): 'HABIT_ORGANIZE_GAME' | 'HABIT_ORGANIZE_TOURNAMENT' | 'HABIT_ORGANIZE_BAR' {
  if (kind === 'GAME') return 'HABIT_ORGANIZE_GAME';
  if (kind === 'TOURNAMENT') return 'HABIT_ORGANIZE_TOURNAMENT';
  return 'HABIT_ORGANIZE_BAR';
}

export function organizeCounterKey(
  kind: OrganizeHabitKind,
): 'organizedGames' | 'organizedTournaments' | 'organizedBars' {
  if (kind === 'GAME') return 'organizedGames';
  if (kind === 'TOURNAMENT') return 'organizedTournaments';
  return 'organizedBars';
}

/** Rated padel GAME/TOURNAMENT finals; BAR finals (any sport). */
export function gameQualifiesForOrganizeHabit(params: {
  entityType: string;
  sport: string;
  affectsRating: boolean;
  kind: OrganizeHabitKind;
}): boolean {
  if (params.kind === 'BAR') {
    return params.entityType === 'BAR';
  }
  if (params.sport !== 'PADEL') return false;
  if (!params.affectsRating) return false;
  if (params.kind === 'GAME') return params.entityType === 'GAME';
  return params.entityType === 'TOURNAMENT';
}

export function filterOrganizeDefinitionsDue(params: {
  definitions: readonly AchievementDefinition[];
  kind: OrganizeHabitKind;
  before: number;
  after: number;
  ownedDefinitionIds: ReadonlySet<string>;
}): AchievementDefinition[] {
  const ruleKind = organizeRuleKindFor(params.kind);
  return params.definitions.filter((definition) => {
    if (definition.ruleKind !== ruleKind) return false;
    if (definition.multiplicity !== 'one_shot') return false;
    if (params.ownedDefinitionIds.has(definition.id)) return false;
    const target = definition.threshold;
    if (target == null || target <= 0) return false;
    if (params.after < target) return false;
    if (params.before >= target) return false;
    return true;
  });
}
