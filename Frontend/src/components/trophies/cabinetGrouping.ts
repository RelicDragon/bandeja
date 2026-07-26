import type { TrophyCabinetEntryView } from '@/types/trophies';

export type TrophyCabinetRailItem =
  | { kind: 'card'; key: string; entry: TrophyCabinetEntryView }
  | {
      kind: 'stack';
      key: string;
      ruleKind: string;
      unlocked: boolean;
      /** Cheapest → hardest; last entry is top of the pile. */
      entries: TrophyCabinetEntryView[];
    };

function stackSortKey(entry: TrophyCabinetEntryView): number {
  const { definition } = entry;
  if (typeof definition.threshold === 'number' && Number.isFinite(definition.threshold)) {
    return definition.threshold;
  }
  if (typeof definition.place === 'number' && Number.isFinite(definition.place)) {
    // Higher place number = cheaper (bronze behind, gold on top).
    return 4 - definition.place;
  }
  return 0;
}

/** Sort cheapest/easiest first so the rarest sits on top of the pile. */
export function sortStackEntries(entries: TrophyCabinetEntryView[]): TrophyCabinetEntryView[] {
  return [...entries].sort((a, b) => stackSortKey(a) - stackSortKey(b));
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

/**
 * Group cabinet entries by (ruleKind, unlocked).
 * Singles stay cards; 2+ become stacks. Unlocked stacks stay separate from locked.
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
    const key = `${ruleKind}::${entry.unlocked ? 'u' : 'l'}`;
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
    const ruleKind = group[0]!.definition.ruleKind;
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
      const aTime = a.kind === 'card' ? entryRecency(a.entry) : groupRecency(a.entries);
      const bTime = b.kind === 'card' ? entryRecency(b.entry) : groupRecency(b.entries);
      return bTime - aTime;
    }

    const aProg =
      a.kind === 'card' ? entryProgressRatio(a.entry) : groupProgressRatio(a.entries);
    const bProg =
      b.kind === 'card' ? entryProgressRatio(b.entry) : groupProgressRatio(b.entries);
    return bProg - aProg;
  });
}
