import { chatLocalDb } from './chatLocalDb';

const mem = new Map<string, number>();
const heuristicIds = new Set<string>();
let cacheGeneration = 0;
const MEM_CAP = 4000;
const pending = new Map<string, number>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_MS = 800;
const MIN_PX = 28;
const MAX_PX = 24000;

function trimMemIfNeeded(): void {
  while (mem.size > MEM_CAP) {
    const first = mem.keys().next().value as string | undefined;
    if (first === undefined) break;
    mem.delete(first);
    heuristicIds.delete(first);
  }
}

function memSet(id: string, heightPx: number, heuristic = false): void {
  if (heuristic) heuristicIds.add(id);
  else heuristicIds.delete(id);
  if (mem.has(id)) mem.delete(id);
  mem.set(id, heightPx);
  trimMemIfNeeded();
}

function scheduleFlush(): void {
  if (flushTimer != null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushPendingHeights();
  }, FLUSH_MS);
}

async function flushPendingHeights(): Promise<void> {
  if (pending.size === 0) return;
  const entries = [...pending.entries()];
  pending.clear();
  const now = Date.now();
  try {
    await chatLocalDb.transaction('rw', chatLocalDb.messageRowHeights, async () => {
      for (const [messageId, heightPx] of entries) {
        await chatLocalDb.messageRowHeights.put({ messageId, heightPx, updatedAt: now });
      }
    });
  } catch {
    for (const [messageId, heightPx] of entries) {
      pending.set(messageId, heightPx);
    }
    scheduleFlush();
  }
}

export function getCachedMessageRowHeight(messageId: string | undefined): number | undefined {
  if (!messageId) return undefined;
  return mem.get(messageId);
}

/** In-memory only (Dexie flush on next measure) — for open tail placeholders. */
export function seedEphemeralMessageRowHeight(messageId: string | undefined, heightPx: number): void {
  if (!messageId) return;
  const rounded = Math.round(heightPx);
  if (rounded < MIN_PX || rounded > MAX_PX) return;
  if (mem.get(messageId) != null) return;
  memSet(messageId, rounded, true);
}

/** Restore heights captured in L1; does not overwrite fresher in-memory measures. */
export function seedMessageRowHeights(heights: Record<string, number> | undefined): void {
  if (!heights) return;
  for (const [messageId, heightPx] of Object.entries(heights)) {
    if (!messageId) continue;
    const rounded = Math.round(heightPx);
    if (rounded < MIN_PX || rounded > MAX_PX) continue;
    if (mem.get(messageId) != null) continue;
    memSet(messageId, rounded);
  }
}

/** Disk geometry may replace estimates, but never a newer L1/DOM measurement. */
export async function preloadMessageRowHeights(
  messageIds: string[],
  shouldApply?: () => boolean
): Promise<boolean> {
  const needsHeight = (id: string) => !mem.has(id) || heuristicIds.has(id);
  const ids = [...new Set(messageIds)].filter((id) => id && needsHeight(id));
  if (ids.length === 0) return false;
  const generation = cacheGeneration;
  try {
    const rows = await chatLocalDb.messageRowHeights.bulkGet(ids);
    if (generation !== cacheGeneration || (shouldApply && !shouldApply())) return false;
    let changed = false;
    for (let i = 0; i < ids.length; i++) {
      const row = rows[i];
      const id = ids[i];
      // A row may have been measured while IndexedDB was reading.
      if (id && needsHeight(id) && row?.heightPx && row.heightPx >= MIN_PX && row.heightPx <= MAX_PX) {
        changed ||= mem.get(id) !== row.heightPx;
        memSet(id, row.heightPx);
      }
    }
    return changed;
  } catch {
    return false;
  }
}

export function rememberMeasuredMessageHeight(messageId: string | undefined, heightPx: number): void {
  if (!messageId) return;
  const rounded = Math.round(heightPx);
  if (rounded < MIN_PX || rounded > MAX_PX) return;
  const prev = mem.get(messageId);
  if (prev != null && !heuristicIds.has(messageId) && Math.abs(prev - rounded) < 4) return;
  memSet(messageId, rounded);
  pending.set(messageId, rounded);
  scheduleFlush();
}

export function clearMessageHeightMemoryCache(): void {
  mem.clear();
  heuristicIds.clear();
  cacheGeneration += 1;
}
