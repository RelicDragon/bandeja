import {
  ACHIEVEMENT_CATALOG,
  accumulatePartnerCountersForUser,
  type AchievementDefinition,
} from '@bandeja/shared/achievements';
import type { HabitCrossing } from './habitCrossingDates';
import { loadPartnerGamesChronological } from './partnerGrant.service';

function sortByThreshold(defs: AchievementDefinition[]): AchievementDefinition[] {
  return [...defs].sort((a, b) => (a.threshold ?? 0) - (b.threshold ?? 0));
}

function defsFor(
  ruleKind: 'HABIT_GIANT_KILLER' | 'HABIT_DYNAMIC_DUO' | 'HABIT_OPEN_COURT',
): AchievementDefinition[] {
  return sortByThreshold(
    ACHIEVEMENT_CATALOG.filter(
      (d) => d.multiplicity === 'one_shot' && d.ruleKind === ruleKind && d.threshold != null,
    ),
  );
}

function recordCrossings(
  out: Map<string, HabitCrossing>,
  pending: AchievementDefinition[],
  value: number,
  at: Date,
  gameId: string,
): void {
  while (
    pending.length > 0 &&
    value >= (pending[0]!.threshold ?? Number.POSITIVE_INFINITY)
  ) {
    const def = pending.shift()!;
    if (out.has(def.id)) continue;
    out.set(def.id, { definitionId: def.id, earnedAt: at, sourceGameId: gameId });
  }
}

/**
 * Walk qualifying doubles history game-by-game; record first crossing dates.
 */
export async function computePartnerCrossingDates(params: {
  userId: string;
  definitionIds: ReadonlySet<string>;
}): Promise<Map<string, HabitCrossing>> {
  const out = new Map<string, HabitCrossing>();
  const wanted = params.definitionIds;
  if (wanted.size === 0) return out;

  const pendingGk = defsFor('HABIT_GIANT_KILLER').filter((d) => wanted.has(d.id));
  const pendingDuo = defsFor('HABIT_DYNAMIC_DUO').filter((d) => wanted.has(d.id));
  const pendingOpen = defsFor('HABIT_OPEN_COURT').filter((d) => wanted.has(d.id));
  if (pendingGk.length === 0 && pendingDuo.length === 0 && pendingOpen.length === 0) {
    return out;
  }

  const games = await loadPartnerGamesChronological(params.userId);
  const prefix: Array<{
    players: (typeof games)[number]['players'];
    matches: (typeof games)[number]['matches'];
  }> = [];

  for (const game of games) {
    prefix.push({ players: game.players, matches: game.matches });
    const counters = accumulatePartnerCountersForUser(prefix, params.userId);
    recordCrossings(out, pendingGk, counters.giantKillerWins, game.finishedAt, game.id);
    recordCrossings(out, pendingDuo, counters.dynamicDuoMaxWins, game.finishedAt, game.id);
    recordCrossings(out, pendingOpen, counters.openCourtPartners, game.finishedAt, game.id);
    if (pendingGk.length === 0 && pendingDuo.length === 0 && pendingOpen.length === 0) break;
  }

  return out;
}
