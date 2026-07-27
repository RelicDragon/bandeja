import { ACHIEVEMENT_CATALOG } from '@shared/achievements';
import type { TrophyCabinetEntryView, TrophyDefinitionView } from '@/types/trophies';

export type TrophyCabinetRailItem =
  | { kind: 'card'; key: string; entry: TrophyCabinetEntryView }
  | {
      kind: 'stack';
      key: string;
      ruleKind: string;
      /** True when the stack has at least one unlocked entry. */
      unlocked: boolean;
      /** Best → worst among unlocked, then next-chase → hardest among locked. */
      entries: TrophyCabinetEntryView[];
    };

/** First win → wins ladder; sport debut games → volume games ladder. */
export function stackFamilyKey(ruleKind: string): string {
  if (ruleKind === 'HABIT_FIRST_WIN') return 'HABIT_WINS';
  if (ruleKind === 'HABIT_SPORT_VOLUME') return 'HABIT_VOLUME';
  return ruleKind;
}

/** Higher = better (harder threshold, better podium place). */
export function definitionBetterScore(
  definition: Pick<TrophyDefinitionView, 'threshold' | 'place'>,
): number {
  if (typeof definition.threshold === 'number' && Number.isFinite(definition.threshold)) {
    return definition.threshold;
  }
  if (typeof definition.place === 'number' && Number.isFinite(definition.place)) {
    // place 1 (gold) > place 2 > place 3
    return 4 - definition.place;
  }
  return 0;
}

/** Higher = better (harder threshold, better podium place). */
export function stackBetterScore(entry: TrophyCabinetEntryView): number {
  return definitionBetterScore(entry.definition);
}

/** Sort best → worst so carousel / expanded row leftmost is the best. */
export function sortStackEntries(entries: TrophyCabinetEntryView[]): TrophyCabinetEntryView[] {
  return [...entries].sort((a, b) => stackBetterScore(b) - stackBetterScore(a));
}

/**
 * Own-profile family order: unlocked best → worst, then locked next-chase → hardest.
 * All-unlocked / all-locked stay best → worst.
 */
export function sortFamilyStackEntries(
  entries: TrophyCabinetEntryView[],
): TrophyCabinetEntryView[] {
  const unlocked = entries.filter((e) => e.unlocked);
  const locked = entries.filter((e) => !e.unlocked);
  if (unlocked.length === 0 || locked.length === 0) {
    return sortStackEntries(entries);
  }
  return [
    ...sortStackEntries(unlocked),
    ...sortStackEntries(locked).reverse(),
  ];
}

/** Next locked level to chase (lowest better-score among locked). */
export function nextChaseEntry(
  entries: readonly TrophyCabinetEntryView[],
): TrophyCabinetEntryView | null {
  let chase: TrophyCabinetEntryView | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const entry of entries) {
    if (entry.unlocked) continue;
    const score = stackBetterScore(entry);
    if (score < bestScore) {
      bestScore = score;
      chase = entry;
    }
  }
  return chase;
}

/** Highest tier in a family stack (max threshold / best podium place). */
export function isMaxLevelEntry(
  entry: TrophyCabinetEntryView,
  entries: readonly TrophyCabinetEntryView[],
): boolean {
  if (entries.length === 0) return false;
  const score = stackBetterScore(entry);
  for (const other of entries) {
    if (stackBetterScore(other) > score) return false;
  }
  return true;
}

/**
 * True when this definition is the hardest tier in its catalog family
 * (used for solo cards / detail when no stack siblings are in hand).
 */
export function isCatalogFamilyMaxLevel(
  definition: Pick<TrophyDefinitionView, 'id' | 'ruleKind' | 'threshold' | 'place'>,
): boolean {
  if (!definition.ruleKind) return false;
  const family = stackFamilyKey(definition.ruleKind);
  let maxScore = Number.NEGATIVE_INFINITY;
  for (const other of ACHIEVEMENT_CATALOG) {
    if (stackFamilyKey(other.ruleKind) !== family) continue;
    const score = definitionBetterScore(other);
    if (score > maxScore) maxScore = score;
  }
  return definitionBetterScore(definition) === maxScore;
}

function entryRecency(entry: TrophyCabinetEntryView): number {
  const earned = entry.instances[0]?.earnedAt;
  if (!earned) return 0;
  const ts = Date.parse(earned);
  return Number.isFinite(ts) ? ts : 0;
}

function entryProgressRatio(entry: TrophyCabinetEntryView): number {
  const p = entry.progress;
  if (!p || !(p.target > 0) || !Number.isFinite(p.current) || !Number.isFinite(p.target)) {
    return 0;
  }
  return Math.min(1, Math.max(0, p.current / p.target));
}

function groupRecency(entries: TrophyCabinetEntryView[]): number {
  let max = 0;
  for (const entry of entries) {
    const ts = entryRecency(entry);
    if (ts > max) max = ts;
  }
  return max;
}

function groupProgressRatio(entries: TrophyCabinetEntryView[]): number {
  const chase = nextChaseEntry(entries);
  if (chase) return entryProgressRatio(chase);
  let max = 0;
  for (const entry of entries) {
    const ratio = entryProgressRatio(entry);
    if (ratio > max) max = ratio;
  }
  return max;
}

function itemBetterScore(item: TrophyCabinetRailItem): number {
  if (item.kind === 'card') return stackBetterScore(item.entry);
  let max = 0;
  for (const entry of item.entries) {
    if (!entry.unlocked) continue;
    const score = stackBetterScore(entry);
    if (score > max) max = score;
  }
  if (max > 0) return max;
  for (const entry of item.entries) {
    const score = stackBetterScore(entry);
    if (score > max) max = score;
  }
  return max;
}

function itemRecency(item: TrophyCabinetRailItem): number {
  return item.kind === 'card' ? entryRecency(item.entry) : groupRecency(item.entries);
}

function itemProgressRatio(item: TrophyCabinetRailItem): number {
  return item.kind === 'card'
    ? entryProgressRatio(item.entry)
    : groupProgressRatio(item.entries);
}

function itemHasUnlocked(item: TrophyCabinetRailItem): boolean {
  return item.kind === 'card' ? item.entry.unlocked : item.unlocked;
}

export type GroupCabinetRailOptions = {
  /**
   * Own cabinet: one family stack mixes locked + unlocked until max level is earned.
   * Visitors keep unlocked/locked separated (visitors usually have no locked rows).
   */
  mergeLockState?: boolean;
};

/**
 * Group cabinet entries by stack family (and optionally lock state).
 * Singles stay cards; 2+ become stacks.
 * Rail order: unlocked/mixed first (best leftmost), then locked (closest progress leftmost).
 */
export function groupCabinetRailItems(
  entries: TrophyCabinetEntryView[],
  options?: GroupCabinetRailOptions,
): TrophyCabinetRailItem[] {
  if (entries.length === 0) return [];

  const mergeLockState = options?.mergeLockState === true;
  const buckets = new Map<string, TrophyCabinetEntryView[]>();
  const order: string[] = [];

  for (const entry of entries) {
    const ruleKind = entry.definition?.ruleKind;
    if (!ruleKind || !entry.definition?.id) continue;
    const family = stackFamilyKey(ruleKind);
    const key = mergeLockState
      ? family
      : `${family}::${entry.unlocked ? 'u' : 'l'}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = [];
      buckets.set(key, bucket);
      order.push(key);
    }
    bucket.push(entry);
  }

  const items: TrophyCabinetRailItem[] = [];
  for (const key of order) {
    const group = buckets.get(key);
    if (!group || group.length === 0) continue;
    const hasUnlocked = group.some((e) => e.unlocked);
    const ruleKind = stackFamilyKey(group[0]!.definition.ruleKind);
    if (group.length === 1) {
      const entry = group[0]!;
      items.push({ kind: 'card', key: entry.definition.id, entry });
      continue;
    }
    const sorted = mergeLockState
      ? sortFamilyStackEntries(group)
      : sortStackEntries(group);
    items.push({
      kind: 'stack',
      key: mergeLockState
        ? ruleKind
        : `${ruleKind}-${hasUnlocked ? 'unlocked' : 'locked'}`,
      ruleKind,
      unlocked: hasUnlocked,
      entries: sorted,
    });
  }

  return items.sort((a, b) => {
    const aUnlocked = itemHasUnlocked(a);
    const bUnlocked = itemHasUnlocked(b);
    if (aUnlocked !== bUnlocked) return aUnlocked ? -1 : 1;

    if (aUnlocked && bUnlocked) {
      const better = itemBetterScore(b) - itemBetterScore(a);
      if (better !== 0) return better;
      return itemRecency(b) - itemRecency(a);
    }

    const prog = itemProgressRatio(b) - itemProgressRatio(a);
    if (prog !== 0) return prog;
    return itemBetterScore(a) - itemBetterScore(b);
  });
}
