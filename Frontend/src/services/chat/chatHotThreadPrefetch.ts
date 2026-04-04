import { Network } from '@capacitor/network';
import { isCapacitor } from '@/utils/capacitor';
import { useNetworkStore } from '@/utils/networkStatus';
import { chatLocalDb, type ChatThreadMetaRow } from './chatLocalDb';
import { parseChatThreadCursorKey } from './chatThreadCursorKeyParse';
import { normalizeChatType } from '@/utils/chatType';
import { pullMissedAndPersistToDexie } from './chatThreadNetworkSync';
import { enqueueChatSyncPull, SYNC_PRIORITY_COOP } from './chatSyncScheduler';
import { parsePositiveIntEnv } from './chatSyncEnv';

const TOP_K = parsePositiveIntEnv(import.meta.env.VITE_CHAT_HOT_PREFETCH_TOP_K, 5);
const GLOBAL_COOLDOWN_MS = parsePositiveIntEnv(import.meta.env.VITE_CHAT_HOT_PREFETCH_GLOBAL_COOLDOWN_MS, 120_000);
const PER_THREAD_MIN_PULL_GAP_MS = parsePositiveIntEnv(import.meta.env.VITE_CHAT_HOT_PREFETCH_THREAD_GAP_MS, 90_000);
const IDLE_TIMEOUT_MS = 900;

let lastGlobalPrefetchAt = 0;

async function shouldPrefetchOnCurrentConnection(): Promise<boolean> {
  if (!isCapacitor()) return true;
  try {
    const s = await Network.getStatus();
    if (!s.connected) return false;
    if (s.connectionType === 'cellular') return false;
    return true;
  } catch {
    return true;
  }
}

function scoreThreadRow(row: { openCount?: number; lastOpenedAt?: number }): number {
  const oc = row.openCount ?? 0;
  const la = row.lastOpenedAt ?? 0;
  return oc * 1_000_000 + la;
}

export async function runHotThreadPrefetchNow(): Promise<void> {
  if (!useNetworkStore.getState().isOnline) return;
  if (!(await shouldPrefetchOnCurrentConnection())) return;
  const now = Date.now();
  if (now - lastGlobalPrefetchAt < GLOBAL_COOLDOWN_MS) return;
  lastGlobalPrefetchAt = now;

  let rows: ChatThreadMetaRow[];
  try {
    rows = await chatLocalDb.chatThreads.toArray();
  } catch {
    return;
  }

  const candidates = rows
    .filter((r) => r.lastOpenedAt != null && r.lastOpenedAt > 0)
    .map((r) => ({ r, s: scoreThreadRow(r) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, TOP_K);

  for (const { r } of candidates) {
    const parsed = parseChatThreadCursorKey(r.key);
    if (!parsed) continue;
    const lastOk = r.lastSuccessfulPullAt ?? 0;
    if (now - lastOk < PER_THREAD_MIN_PULL_GAP_MS) continue;

    const gameChatType =
      parsed.contextType === 'GAME'
        ? normalizeChatType(r.lastGameChatType ?? 'PUBLIC')
        : undefined;

    await pullMissedAndPersistToDexie({
      contextType: parsed.contextType,
      contextId: parsed.contextId,
      gameChatType,
    }).catch(() => {});

    enqueueChatSyncPull(parsed.contextType, parsed.contextId, SYNC_PRIORITY_COOP);

    await new Promise((res) => setTimeout(res, 400));
  }
}

export function scheduleChatHotThreadPrefetchFromIdle(): void {
  const run = () => void runHotThreadPrefetchNow();
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS });
  } else {
    setTimeout(run, IDLE_TIMEOUT_MS);
  }
}
