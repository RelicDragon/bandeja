import type { ChatContextType } from '@/api/chat';
import { chatSyncPullStarted, chatSyncPullEnded } from '@/services/chat/chatOfflineBanner';
import { recordChatSyncPullFailure, resetChatSyncMetrics } from '@/services/chat/chatSyncMetrics';
import { shouldDeferLowPriorityChatSyncPull } from '@/services/chat/chatSyncAppVisibility';
import { chatCursorKey, chatLocalDb } from './chatLocalDb';
import { pullAndApplyChatSyncEvents } from './chatLocalApply';
import { parsePositiveIntEnv } from './chatSyncEnv';

const MAX_CONCURRENT = 2;
const LEASE_MS = 2200;
const LOW_PRI_WINDOW_MS = parsePositiveIntEnv(
  import.meta.env.VITE_CHAT_SYNC_LOW_PRI_WINDOW_MS,
  28_000
);
const LOW_PRI_MAX_STARTS_PER_WINDOW = parsePositiveIntEnv(
  import.meta.env.VITE_CHAT_SYNC_LOW_PRI_MAX_STARTS,
  20
);
let lowPriWindowStart = 0;
let lowPriStartsInWindow = 0;

function resetLowPriorityChatSyncPullBudget(): void {
  lowPriWindowStart = 0;
  lowPriStartsInWindow = 0;
}
export const SYNC_PRIORITY_VIEWING = 105;
export const SYNC_PRIORITY_FOREGROUND = 100;
export const SYNC_PRIORITY_UNREAD = 92;
export const SYNC_PRIORITY_GAP = 85;
export const SYNC_PRIORITY_COOP = 45;
export const SYNC_PRIORITY_WARM = 12;

type Job = { contextType: ChatContextType; contextId: string; priority: number };
const pending = new Map<string, Job>();
let running = 0;

async function tryLease(key: string, priority: number): Promise<boolean> {
  if (priority >= SYNC_PRIORITY_GAP) return true;
  const row = await chatLocalDb.chatThreads.get(key);
  const retry = row?.nextRetryAt;
  if (retry != null && Date.now() < retry) return false;
  const t = row?.lastPullStartedAt ?? 0;
  if (Date.now() - t < LEASE_MS) return false;
  return true;
}

async function markPullStart(key: string): Promise<void> {
  const row = await chatLocalDb.chatThreads.get(key);
  const now = Date.now();
  const base = row ?? { key, serverMaxSeq: 0, updatedAt: now };
  await chatLocalDb.chatThreads.put({
    ...base,
    key,
    serverMaxSeq: base.serverMaxSeq ?? 0,
    updatedAt: now,
    lastPullStartedAt: now,
  });
}

async function markPullEnd(key: string): Promise<void> {
  const row = await chatLocalDb.chatThreads.get(key);
  if (!row) return;
  await chatLocalDb.chatThreads.put({
    ...row,
    updatedAt: Date.now(),
    lastSuccessfulPullAt: Date.now(),
    lastPullStartedAt: undefined,
    pullErrorAt: undefined,
    nextRetryAt: undefined,
  });
}

async function markPullFailed(key: string): Promise<void> {
  const row = await chatLocalDb.chatThreads.get(key);
  const now = Date.now();
  const base = row ?? { key, serverMaxSeq: 0, updatedAt: now };
  const backoff = 8000 + Math.floor(Math.random() * 14_000);
  await chatLocalDb.chatThreads.put({
    ...base,
    key,
    serverMaxSeq: base.serverMaxSeq ?? 0,
    updatedAt: now,
    lastPullStartedAt: undefined,
    pullErrorAt: now,
    nextRetryAt: now + backoff,
  });
}

function pump(): void {
  while (running < MAX_CONCURRENT && pending.size > 0) {
    const sorted = [...pending.values()].sort((a, b) => b.priority - a.priority);
    const job = sorted[0];
    if (!job) break;
    const key = chatCursorKey(job.contextType, job.contextId);
    pending.delete(key);
    running++;
    void (async () => {
      const leased = await tryLease(key, job.priority);
      if (!leased) {
        running--;
        pending.set(key, job);
        setTimeout(pump, LEASE_MS);
        return;
      }
      if (job.priority < SYNC_PRIORITY_GAP && shouldDeferLowPriorityChatSyncPull()) {
        running--;
        pending.set(key, job);
        setTimeout(pump, 1500);
        return;
      }
      if (job.priority <= SYNC_PRIORITY_COOP) {
        const now = Date.now();
        if (now - lowPriWindowStart > LOW_PRI_WINDOW_MS) {
          lowPriWindowStart = now;
          lowPriStartsInWindow = 0;
        }
        if (lowPriStartsInWindow >= LOW_PRI_MAX_STARTS_PER_WINDOW) {
          running--;
          pending.set(key, job);
          setTimeout(pump, 1400);
          return;
        }
        lowPriStartsInWindow += 1;
      }
      chatSyncPullStarted();
      try {
        await markPullStart(key);
        await pullAndApplyChatSyncEvents(job.contextType, job.contextId);
        await markPullEnd(key);
      } catch {
        recordChatSyncPullFailure();
        await markPullFailed(key);
      } finally {
        chatSyncPullEnded();
        running--;
        pump();
      }
    })();
  }
}

export function enqueueChatSyncPull(
  contextType: ChatContextType,
  contextId: string,
  priority: number = SYNC_PRIORITY_WARM
): void {
  const key = chatCursorKey(contextType, contextId);
  const prev = pending.get(key);
  if (!prev || priority >= prev.priority) {
    pending.set(key, { contextType, contextId, priority });
  }
  if (import.meta.env.DEV && pending.size > 40) {
    console.warn('[chatSync] pull queue depth', pending.size);
  }
  pump();
}

export function clearChatSyncScheduler(): void {
  pending.clear();
  resetLowPriorityChatSyncPullBudget();
  resetChatSyncMetrics();
}
