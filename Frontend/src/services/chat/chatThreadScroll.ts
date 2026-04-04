import { chatLocalDb, type ThreadScrollRow } from '@/services/chat/chatLocalDb';

export type { ThreadScrollRow };

const SAVE_DEBOUNCE_MS = 380;
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingByKey = new Map<string, ThreadScrollRow>();

export async function getThreadScrollState(key: string): Promise<ThreadScrollRow | undefined> {
  try {
    return await chatLocalDb.threadScroll.get(key);
  } catch {
    return undefined;
  }
}

export function flushThreadScrollSave(key: string): void {
  const t = debounceTimers.get(key);
  if (t) clearTimeout(t);
  debounceTimers.delete(key);
  const row = pendingByKey.get(key);
  if (!row) return;
  pendingByKey.delete(key);
  void chatLocalDb.threadScroll.put(row).catch(() => {});
}

export function scheduleThreadScrollSave(key: string, partial: Omit<ThreadScrollRow, 'key' | 'updatedAt'>): void {
  const prev = pendingByKey.get(key);
  const next: ThreadScrollRow = {
    key,
    anchorMessageId: partial.anchorMessageId,
    atBottom: partial.atBottom,
    updatedAt: Date.now(),
  };
  if (
    prev &&
    prev.atBottom === next.atBottom &&
    prev.anchorMessageId === next.anchorMessageId
  ) {
    return;
  }
  pendingByKey.set(key, next);
  const existing = debounceTimers.get(key);
  if (existing) clearTimeout(existing);
  debounceTimers.set(
    key,
    setTimeout(() => {
      debounceTimers.delete(key);
      const row = pendingByKey.get(key);
      if (!row) return;
      pendingByKey.delete(key);
      void chatLocalDb.threadScroll.put(row).catch(() => {});
    }, SAVE_DEBOUNCE_MS)
  );
}
