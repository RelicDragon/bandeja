import {
  getAchievementDefinition,
  resolveTrophyShowcase,
  type AchievementDefinitionId,
  type AchievementInstanceInput,
} from '@shared/achievements';
import type { UserStats } from '@/api/users';
import type {
  TrophiesPayload,
  TrophyDefinitionView,
  TrophyInstanceView,
  TrophyShowcaseSlotView,
} from '@/types/trophies';

function toDefinitionView(
  def: NonNullable<ReturnType<typeof getAchievementDefinition>>,
): TrophyDefinitionView {
  return {
    id: def.id,
    type: def.type,
    rarity: def.rarity,
    artKey: def.artKey,
    ruleKind: def.ruleKind,
    titleKey: def.titleKey,
    descriptionKey: def.descriptionKey,
    ...(def.place != null ? { place: def.place } : {}),
    ...(def.threshold != null ? { threshold: def.threshold } : {}),
  };
}

function flattenInstances(trophies: TrophiesPayload): TrophyInstanceView[] {
  const byId = new Map<string, TrophyInstanceView>();
  for (const entry of trophies.cabinet) {
    for (const instance of entry.instances) {
      byId.set(instance.id, instance);
    }
  }
  for (const slot of trophies.showcase) {
    if (slot.instance) byId.set(slot.instance.id, slot.instance);
  }
  return [...byId.values()];
}

function resolveShowcaseViews(
  trophies: TrophiesPayload,
  pinInputs: Array<{ slot: number; achievementId: string }>,
): TrophyShowcaseSlotView[] {
  const instances = flattenInstances(trophies);
  const instanceInputs: AchievementInstanceInput[] = instances.map((i) => ({
    id: i.id,
    definitionId: i.definitionId as AchievementDefinitionId,
    earnedAt: i.earnedAt,
    sport: i.sport,
    place: i.place,
  }));
  const resolved = resolveTrophyShowcase({ instances: instanceInputs, pins: pinInputs });
  const byId = new Map(instances.map((i) => [i.id, i]));
  return resolved.map((s) => {
    const instance = s.instance ? byId.get(s.instance.id) ?? null : null;
    const def = s.definitionId ? getAchievementDefinition(s.definitionId) : undefined;
    return {
      slot: s.slot,
      pinned: s.pinned,
      definition: def ? toDefinitionView(def) : null,
      instance,
    };
  });
}

export function applyOptimisticPin(
  trophies: TrophiesPayload,
  achievementId: string,
  slot: number,
): TrophiesPayload {
  const preserved = trophies.showcase
    .filter((s) => s.pinned && s.instance && s.instance.id !== achievementId)
    .map((s) => ({ slot: s.slot, id: s.instance!.id }));
  const used = new Set(preserved.map((p) => p.slot));
  let target = slot;
  if (used.has(target)) {
    target = 0;
    while (used.has(target)) target += 1;
  }
  preserved.push({ slot: target, id: achievementId });
  preserved.sort((a, b) => a.slot - b.slot);

  const pinInputs = preserved.map((p) => ({ slot: p.slot, achievementId: p.id }));
  return {
    ...trophies,
    pinnedInstanceIds: preserved.map((p) => p.id),
    showcase: resolveShowcaseViews(trophies, pinInputs),
  };
}

export function applyOptimisticUnpin(
  trophies: TrophiesPayload,
  achievementId: string,
): TrophiesPayload {
  const pinInputs = trophies.showcase
    .filter((s) => s.pinned && s.instance && s.instance.id !== achievementId)
    .map((s) => ({ slot: s.slot, achievementId: s.instance!.id }));

  return {
    ...trophies,
    pinnedInstanceIds: pinInputs.map((p) => p.achievementId),
    showcase: resolveShowcaseViews(trophies, pinInputs),
  };
}

export function patchUserStatsTrophies(
  stats: UserStats,
  nextTrophies: TrophiesPayload,
): UserStats {
  return {
    ...stats,
    user: {
      ...stats.user,
      trophies: nextTrophies,
    },
  };
}
