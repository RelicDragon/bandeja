import {
  ACHIEVEMENT_CATALOG,
  isLifetimeAchievement,
  type AchievementDefinition,
} from '@bandeja/shared/achievements';
import type { HabitCrossing } from './habitCrossingDates';
import { loadTieBreakWinsChronological } from './tieBreakGrant.service';

function sortByThreshold(defs: AchievementDefinition[]): AchievementDefinition[] {
  return [...defs].sort((a, b) => (a.threshold ?? 0) - (b.threshold ?? 0));
}

export async function computeTieBreakCrossingDates(params: {
  userId: string;
  definitionIds: ReadonlySet<string>;
}): Promise<Map<string, HabitCrossing>> {
  const out = new Map<string, HabitCrossing>();
  const pending = sortByThreshold(
    ACHIEVEMENT_CATALOG.filter(
      (d) =>
        isLifetimeAchievement(d) &&
        d.ruleKind === 'HABIT_TIE_BREAK' &&
        d.threshold != null &&
        params.definitionIds.has(d.id),
    ),
  );
  if (pending.length === 0) return out;

  const wins = await loadTieBreakWinsChronological({ userId: params.userId });
  let count = 0;
  for (const win of wins) {
    count += 1;
    while (
      pending.length > 0 &&
      count >= (pending[0]!.threshold ?? Number.POSITIVE_INFINITY)
    ) {
      const def = pending.shift()!;
      if (!out.has(def.id)) {
        out.set(def.id, {
          definitionId: def.id,
          earnedAt: win.at,
          sourceGameId: win.gameId,
        });
      }
    }
    if (pending.length === 0) break;
  }
  return out;
}
