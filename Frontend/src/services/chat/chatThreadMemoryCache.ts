import type { ChatMessageWithStatus } from '@/api/chat';
import {
  getCachedMessageRowHeight,
  seedEphemeralMessageRowHeight,
  seedMessageRowHeights,
} from '@/services/chat/chatMessageHeights';
import { estimateMessageRowHeightPx } from '@/services/chat/chatMessageRowEstimate';

const MAX_THREADS = 120;
const MAX_MESSAGES_PER_THREAD = 400;
const TTL_MS = 5 * 60 * 1000;

type Snapshot = {
  messages: ChatMessageWithStatus[];
  /** Per-message virtual row heights for stable open layout (esp. images). */
  rowHeights: Record<string, number>;
  savedAt: number;
};

function collectRowHeightsForStorage(rows: readonly ChatMessageWithStatus[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of rows) {
    const id = m.id;
    if (!id) continue;
    const measured = getCachedMessageRowHeight(id);
    out[id] = measured ?? estimateMessageRowHeightPx(m);
  }
  return out;
}

const map = new Map<string, Snapshot>();
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

function isExcludedFromL1(m: ChatMessageWithStatus): boolean {
  if (m._optimisticId) return true;
  if (m._status === 'SENDING' || m._status === 'FAILED') return true;
  return false;
}

function cloneTailForStorage(rows: readonly ChatMessageWithStatus[]): ChatMessageWithStatus[] {
  const filtered = rows.filter((m) => !isExcludedFromL1(m));
  const tail = filtered.slice(-MAX_MESSAGES_PER_THREAD);
  return tail.map((m) => ({ ...m }));
}

function touchGet(key: string): Snapshot | undefined {
  const v = map.get(key);
  if (v === undefined) return undefined;
  map.delete(key);
  map.set(key, v);
  return v;
}

function evictIfNeeded(): void {
  while (map.size > MAX_THREADS) {
    const oldest = map.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

export function peekChatThreadMemory(key: string): ChatMessageWithStatus[] {
  const entry = touchGet(key);
  if (!entry) return [];
  if (Date.now() - entry.savedAt > TTL_MS) {
    map.delete(key);
    return [];
  }
  seedMessageRowHeights(entry.rowHeights ?? {});
  for (const m of entry.messages) {
    if (m.id) {
      seedEphemeralMessageRowHeight(m.id, entry.rowHeights?.[m.id] ?? estimateMessageRowHeightPx(m));
    }
  }
  return entry.messages.map((m) => ({ ...m }));
}

export function putChatThreadMemory(
  key: string,
  rows: readonly ChatMessageWithStatus[],
  verify?: () => boolean
): void {
  if (verify && !verify()) return;
  const messages = cloneTailForStorage(rows);
  if (messages.length === 0) {
    map.delete(key);
    return;
  }
  if (map.has(key)) map.delete(key);
  map.set(key, { messages, rowHeights: collectRowHeightsForStorage(messages), savedAt: Date.now() });
  evictIfNeeded();
}

export function deleteChatThreadMemory(key: string): void {
  map.delete(key);
  const t = debounceTimers.get(key);
  if (t) {
    clearTimeout(t);
    debounceTimers.delete(key);
  }
}

export function clearChatThreadMemory(): void {
  map.clear();
  for (const t of debounceTimers.values()) clearTimeout(t);
  debounceTimers.clear();
}

export function scheduleChatThreadL1DebouncedPut(
  key: string,
  readRows: () => readonly ChatMessageWithStatus[],
  verify: () => boolean,
  delayMs = 1500
): void {
  const existing = debounceTimers.get(key);
  if (existing) clearTimeout(existing);
  const tid = setTimeout(() => {
    debounceTimers.delete(key);
    putChatThreadMemory(key, readRows(), verify);
  }, delayMs);
  debounceTimers.set(key, tid);
}

export function flushChatThreadL1DebouncedPut(
  key: string,
  readRows: () => readonly ChatMessageWithStatus[],
  verify: () => boolean
): void {
  const existing = debounceTimers.get(key);
  if (existing) {
    clearTimeout(existing);
    debounceTimers.delete(key);
  }
  putChatThreadMemory(key, readRows(), verify);
}
