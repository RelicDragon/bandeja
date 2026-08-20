import { ACHIEVEMENT_CATALOG, getAchievementDefinition } from './catalog';
import type {
  AchievementDefinition,
  AchievementInstanceInput,
  TrophyProgress,
} from './types';

export type HabitProgressCounters = {
  /**
   * Current play-streak weeks (max across sports) for streak habits.
   * Uses live count — not lifetime best — so forward-only grants match “streak reaches N”
   * and locked progress shows the chase, not a pre-ship best.
   */
  streakBest: number;
  /** Qualifying finished games count (volume). */
  gamesFinished: number;
  /** Wins count for first-win + win-milestone habits. */
  gamesWon: number;
  /** Per-sport finished games for HABIT_SPORT_VOLUME (keys like PADEL). */
  gamesFinishedBySport?: Readonly<Record<string, number>>;
  /** FINAL rated padel GAME events owned. */
  organizedGames?: number;
  /** FINAL rated padel TOURNAMENT events owned. */
  organizedTournaments?: number;
  /** FINAL BAR events owned (any sport). */
  organizedBars?: number;
  /** Upset wins vs ≥0.5 higher-rated 2v2 (padel rated, reliability). */
  giantKillerWins?: number;
  /** Max wins with any single doubles partner (padel rated). */
  dynamicDuoMaxWins?: number;
  /** Distinct doubles partners in completed qualifying matches. */
  openCourtPartners?: number;
  /** Official sets won on a tie-break (7–6 or flagged super TB). */
  tieBreakSetWins?: number;
  /** Bugs/suggestions shipped through in-progress/test to finished/archived. */
  bugShippedCount?: number;
};

export type CabinetEntry = {
  definition: AchievementDefinition;
  unlocked: boolean;
  instances: AchievementInstanceInput[];
  progress: TrophyProgress | null;
};

export function habitProgressForDefinition(
  definition: AchievementDefinition,
  counters: HabitProgressCounters,
): TrophyProgress | null {
  const target = definition.threshold;
  if (target == null || target <= 0) return null;
  if (definition.ruleKind === 'HABIT_STREAK') {
    return { current: Math.min(counters.streakBest, target), target };
  }
  if (definition.ruleKind === 'HABIT_VOLUME') {
    return { current: Math.min(counters.gamesFinished, target), target };
  }
  if (definition.ruleKind === 'HABIT_FIRST_WIN' || definition.ruleKind === 'HABIT_WINS') {
    return { current: Math.min(counters.gamesWon, target), target };
  }
  if (definition.ruleKind === 'HABIT_SPORT_VOLUME' && definition.sport) {
    const current = counters.gamesFinishedBySport?.[definition.sport] ?? 0;
    return { current: Math.min(current, target), target };
  }
  if (definition.ruleKind === 'HABIT_ORGANIZE_GAME') {
    return { current: Math.min(counters.organizedGames ?? 0, target), target };
  }
  if (definition.ruleKind === 'HABIT_ORGANIZE_TOURNAMENT') {
    return { current: Math.min(counters.organizedTournaments ?? 0, target), target };
  }
  if (definition.ruleKind === 'HABIT_ORGANIZE_BAR') {
    return { current: Math.min(counters.organizedBars ?? 0, target), target };
  }
  if (definition.ruleKind === 'HABIT_GIANT_KILLER') {
    return { current: Math.min(counters.giantKillerWins ?? 0, target), target };
  }
  if (definition.ruleKind === 'HABIT_DYNAMIC_DUO') {
    return { current: Math.min(counters.dynamicDuoMaxWins ?? 0, target), target };
  }
  if (definition.ruleKind === 'HABIT_OPEN_COURT') {
    return { current: Math.min(counters.openCourtPartners ?? 0, target), target };
  }
  if (definition.ruleKind === 'HABIT_TIE_BREAK') {
    return { current: Math.min(counters.tieBreakSetWins ?? 0, target), target };
  }
  if (definition.ruleKind === 'HABIT_BUG_SHIPPED') {
    return { current: Math.min(counters.bugShippedCount ?? 0, target), target };
  }
  return null;
}

/**
 * Build cabinet rows. Owner sees full catalog (locked + unlocked).
 * Visitor sees unlocked definitions only (no locked graveyard).
 */
export function projectTrophyCabinet(input: {
  isOwner: boolean;
  instances: AchievementInstanceInput[];
  counters: HabitProgressCounters;
}): CabinetEntry[] {
  const byDefinition = new Map<string, AchievementInstanceInput[]>();
  for (const instance of input.instances) {
    if (!getAchievementDefinition(instance.definitionId)) continue;
    const list = byDefinition.get(instance.definitionId) ?? [];
    list.push(instance);
    byDefinition.set(instance.definitionId, list);
  }
  for (const list of byDefinition.values()) {
    list.sort((a, b) => Date.parse(b.earnedAt) - Date.parse(a.earnedAt));
  }

  const rows: CabinetEntry[] = [];
  for (const definition of ACHIEVEMENT_CATALOG) {
    const instances = byDefinition.get(definition.id) ?? [];
    const unlocked = instances.length > 0;
    if (!input.isOwner && !unlocked) continue;
    // Event medals: only show when earned (no locked graveyard for past seasons).
    if (definition.ruleKind === 'EVENT_SEASON' && !unlocked) continue;
    rows.push({
      definition,
      unlocked,
      instances,
      progress:
        input.isOwner && !unlocked
          ? habitProgressForDefinition(definition, input.counters)
          : null,
    });
  }
  return rows;
}
