import { chatLocalDb } from './chatLocalDb';

const mem = new Map<string, number>();
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
  }
}

function memSet(id: string, heightPx: number): void {
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

export async function preloadMessageRowHeights(messageIds: string[]): Promise<void> {
  const ids = [...new Set(messageIds)].filter(Boolean);
  if (ids.length === 0) return;
  try {
    const rows = await chatLocalDb.messageRowHeights.bulkGet(ids);
    for (let i = 0; i < ids.length; i++) {
      const row = rows[i];
      const id = ids[i];
      if (id && row?.heightPx && row.heightPx >= MIN_PX && row.heightPx <= MAX_PX) {
        memSet(id, row.heightPx);
      }
    }
  } catch {
    /* ignore */
  }
}

export function rememberMeasuredMessageHeight(messageId: string | undefined, heightPx: number): void {
  if (!messageId) return;
  const rounded = Math.round(heightPx);
  if (rounded < MIN_PX || rounded > MAX_PX) return;
  const prev = mem.get(messageId);
  if (prev != null && Math.abs(prev - rounded) < 4) return;
  memSet(messageId, rounded);
  pending.set(messageId, rounded);
  scheduleFlush();
}

export function clearMessageHeightMemoryCache(): void {
  mem.clear();
}
