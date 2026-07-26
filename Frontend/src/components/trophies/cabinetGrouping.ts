import type { TrophyCabinetEntryView } from '@/types/trophies';

export type TrophyCabinetRailItem =
  | { kind: 'card'; key: string; entry: TrophyCabinetEntryView }
  | {
      kind: 'stack';
      key: string;
      ruleKind: string;
      unlocked: boolean;
      /** Best → worst (leftmost / pile top first). */
      entries: TrophyCabinetEntryView[];
    };

/** First win belongs in the wins ladder stack. */
export function stackFamilyKey(ruleKind: string): string {
  if (ruleKind === 'HABIT_FIRST_WIN') return 'HABIT_WINS';
  return ruleKind;
}

/** Higher = better (harder threshold, better podium place). */
export function stackBetterScore(entry: TrophyCabinetEntryView): number {
  const { definition } = entry;
  if (typeof definition.threshold === 'number' && Number.isFinite(definition.threshold)) {
    return definition.threshold;
  }
  if (typeof definition.place === 'number' && Number.isFinite(definition.place)) {
    // place 1 (gold) > place 2 > place 3
    return 4 - definition.place;
  }
  return 0;
}

/** Sort best → worst so carousel / expanded row leftmost is the best. */
export function sortStackEntries(entries: TrophyCabinetEntryView[]): TrophyCabinetEntryView[] {
  return [...entries].sort((a, b) => stackBetterScore(b) - stackBetterScore(a));
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

/**
 * Group cabinet entries by (stack family, unlocked).
 * Singles stay cards; 2+ become stacks. Unlocked stacks stay separate from locked.
 * Rail order: unlocked first (best leftmost), then locked (closest progress leftmost).
 */
export function groupCabinetRailItems(
  entries: TrophyCabinetEntryView[],
): TrophyCabinetRailItem[] {
  if (entries.length === 0) return [];

  const buckets = new Map<string, TrophyCabinetEntryView[]>();
  const order: string[] = [];

  for (const entry of entries) {
    const ruleKind = entry.definition?.ruleKind;
    if (!ruleKind || !entry.definition?.id) continue;
    const family = stackFamilyKey(ruleKind);
    const key = `${family}::${entry.unlocked ? 'u' : 'l'}`;
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
    const unlocked = group[0]!.unlocked;
    const ruleKind = stackFamilyKey(group[0]!.definition.ruleKind);
    if (group.length === 1) {
      const entry = group[0]!;
      items.push({ kind: 'card', key: entry.definition.id, entry });
      continue;
    }
    items.push({
      kind: 'stack',
      key: `${ruleKind}-${unlocked ? 'unlocked' : 'locked'}`,
      ruleKind,
      unlocked,
      entries: sortStackEntries(group),
    });
  }

  return items.sort((a, b) => {
    const aUnlocked = a.kind === 'card' ? a.entry.unlocked : a.unlocked;
    const bUnlocked = b.kind === 'card' ? b.entry.unlocked : b.unlocked;
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
