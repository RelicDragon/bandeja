import { getAchievementDefinition } from './catalog';
import { compareRarityDesc } from './rarityOrder';
import type {
  AchievementInstanceInput,
  AchievementPinInput,
  TrophyShowcaseResolvedSlot,
} from './types';

export const SHOWCASE_SLOT_COUNT = 3;

/**
 * Resolve showcase slots: pinned instances override auto picks.
 * Auto fill: newest first, then rarer on ties.
 */
export function resolveTrophyShowcase(input: {
  instances: AchievementInstanceInput[];
  pins: AchievementPinInput[];
  slotCount?: number;
}): TrophyShowcaseResolvedSlot[] {
  const slotCount = input.slotCount ?? SHOWCASE_SLOT_COUNT;
  const byId = new Map(input.instances.map((i) => [i.id, i]));

  const slots: TrophyShowcaseResolvedSlot[] = Array.from({ length: slotCount }, (_, slot) => ({
    slot,
    instance: null,
    definitionId: null,
    pinned: false,
  }));

  const usedIds = new Set<string>();

  for (const pin of input.pins) {
    if (pin.slot < 0 || pin.slot >= slotCount) continue;
    const instance = byId.get(pin.achievementId);
    if (!instance) continue;
    if (usedIds.has(instance.id)) continue;
    const def = getAchievementDefinition(instance.definitionId);
    if (!def) continue;
    slots[pin.slot] = {
      slot: pin.slot,
      instance,
      definitionId: def.id,
      pinned: true,
    };
    usedIds.add(instance.id);
  }

  const autoCandidates = input.instances
    .filter((i) => !usedIds.has(i.id) && getAchievementDefinition(i.definitionId))
    .slice()
    .sort((a, b) => {
      const earnedCmp = Date.parse(b.earnedAt) - Date.parse(a.earnedAt);
      if (earnedCmp !== 0) return earnedCmp;
      const defA = getAchievementDefinition(a.definitionId)!;
      const defB = getAchievementDefinition(b.definitionId)!;
      const rarityCmp = compareRarityDesc(defA.rarity, defB.rarity);
      if (rarityCmp !== 0) return rarityCmp;
      return a.id.localeCompare(b.id);
    });

  let autoIdx = 0;
  for (let slot = 0; slot < slotCount; slot += 1) {
    if (slots[slot].instance) continue;
    const next = autoCandidates[autoIdx];
    if (!next) break;
    autoIdx += 1;
    const def = getAchievementDefinition(next.definitionId)!;
    slots[slot] = {
      slot,
      instance: next,
      definitionId: def.id,
      pinned: false,
    };
    usedIds.add(next.id);
  }

  return slots;
}
