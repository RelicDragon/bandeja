import { getAchievementDefinition } from './catalog';
import { compareRarityDesc } from './rarityOrder';
import type {
  AchievementDefinitionId,
  AchievementInstanceInput,
  AchievementPinInput,
  TrophyShowcaseResolvedSlot,
} from './types';

export const SHOWCASE_SLOT_COUNT = 3;

/**
 * Resolve showcase slots:
 * - Group instances by definitionId so repeatable achievements (e.g. 2 gold + 1 silver)
 *   occupy 1 slot per definition with instances list (e.g. gold x2 + silver x1).
 * - Pinned instances come FIRST (occupying starting slots in pin order).
 * - Unpinned auto-fill candidates follow, sorted by newest earnedAt date first.
 */
export function resolveTrophyShowcase(input: {
  instances: AchievementInstanceInput[];
  pins: AchievementPinInput[];
  slotCount?: number;
}): TrophyShowcaseResolvedSlot[] {
  const slotCount = input.slotCount ?? SHOWCASE_SLOT_COUNT;

  // 1. Filter out instances of unknown catalog definitions
  const validInstances = input.instances.filter((i) =>
    Boolean(getAchievementDefinition(i.definitionId)),
  );

  // 2. Group instances by definitionId and sort each group newest first
  const byDefinition = new Map<AchievementDefinitionId, AchievementInstanceInput[]>();
  for (const inst of validInstances) {
    const list = byDefinition.get(inst.definitionId) ?? [];
    list.push(inst);
    byDefinition.set(inst.definitionId, list);
  }
  for (const list of byDefinition.values()) {
    list.sort((a, b) => Date.parse(b.earnedAt) - Date.parse(a.earnedAt));
  }

  const instancesById = new Map<string, AchievementInstanceInput>(
    validInstances.map((i) => [i.id, i]),
  );

  // 3. Resolve pinned definitions (placed FIRST in slots 0, 1, ...)
  const pinnedEntries: Array<{
    definitionId: AchievementDefinitionId;
    primaryInstance: AchievementInstanceInput;
    allInstances: AchievementInstanceInput[];
  }> = [];

  const usedDefinitionIds = new Set<AchievementDefinitionId>();

  const sortedPins = [...input.pins]
    .filter((p) => p.slot >= 0 && p.slot < slotCount)
    .sort((a, b) => a.slot - b.slot);

  for (const pin of sortedPins) {
    const inst = instancesById.get(pin.achievementId);
    if (!inst) continue;
    if (usedDefinitionIds.has(inst.definitionId)) continue;
    const allForDef = byDefinition.get(inst.definitionId) ?? [inst];

    // Put pinned instance first, followed by remainder sorted by earnedAt desc
    const otherInsts = allForDef.filter((i) => i.id !== inst.id);
    const orderedInsts = [inst, ...otherInsts];

    pinnedEntries.push({
      definitionId: inst.definitionId,
      primaryInstance: inst,
      allInstances: orderedInsts,
    });
    usedDefinitionIds.add(inst.definitionId);
    if (pinnedEntries.length >= slotCount) break;
  }

  // 4. Resolve unpinned candidate groups (NEXT, sorted by awarded at date desc)
  const unpinnedCandidates: Array<{
    definitionId: AchievementDefinitionId;
    primaryInstance: AchievementInstanceInput;
    allInstances: AchievementInstanceInput[];
    latestEarnedAt: number;
  }> = [];

  for (const [defId, list] of byDefinition.entries()) {
    if (usedDefinitionIds.has(defId)) continue;
    const latestEarnedAt = Date.parse(list[0].earnedAt);
    unpinnedCandidates.push({
      definitionId: defId,
      primaryInstance: list[0],
      allInstances: list,
      latestEarnedAt: Number.isFinite(latestEarnedAt) ? latestEarnedAt : 0,
    });
  }

  unpinnedCandidates.sort((a, b) => {
    const earnedCmp = b.latestEarnedAt - a.latestEarnedAt;
    if (earnedCmp !== 0) return earnedCmp;
    const defA = getAchievementDefinition(a.definitionId)!;
    const defB = getAchievementDefinition(b.definitionId)!;
    const rarityCmp = compareRarityDesc(defA.rarity, defB.rarity);
    if (rarityCmp !== 0) return rarityCmp;
    return a.definitionId.localeCompare(b.definitionId);
  });

  // 5. Build final slots array
  const slots: TrophyShowcaseResolvedSlot[] = [];

  // Pinned items first
  for (let slot = 0; slot < pinnedEntries.length; slot += 1) {
    const entry = pinnedEntries[slot];
    slots.push({
      slot,
      pinned: true,
      definitionId: entry.definitionId,
      instance: entry.primaryInstance,
      instances: entry.allInstances,
    });
  }

  // Unpinned items next
  let unpinnedIdx = 0;
  while (slots.length < slotCount && unpinnedIdx < unpinnedCandidates.length) {
    const entry = unpinnedCandidates[unpinnedIdx];
    unpinnedIdx += 1;
    slots.push({
      slot: slots.length,
      pinned: false,
      definitionId: entry.definitionId,
      instance: entry.primaryInstance,
      instances: entry.allInstances,
    });
  }

  // Fill empty slots
  while (slots.length < slotCount) {
    slots.push({
      slot: slots.length,
      pinned: false,
      definitionId: null,
      instance: null,
      instances: [],
    });
  }

  return slots;
}
