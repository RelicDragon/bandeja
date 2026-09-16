import type { ChatContextType } from '@/api/chat';
import {
  chatSyncPullStarted,
  chatSyncPullEnded,
  resetChatSyncPullDepth,
} from '@/services/chat/chatOfflineBanner';
import { recordChatSyncPullFailure, resetChatSyncMetrics } from '@/services/chat/chatSyncMetrics';
import { shouldDeferLowPriorityChatSyncPull } from '@/services/chat/chatSyncAppVisibility';
import {
  isGameChatContextGoneHttpError,
  purgeGameChatLocal,
} from '@/services/chat/purgeGameChatLocal';
import { chatCursorKey, chatLocalDb } from './chatLocalDb';
import { pullAndApplyChatSyncEvents } from './chatLocalApply';
import { getLocalCursorSeq } from './chatLocalApplyCursor';
import { parsePositiveIntEnv } from './chatSyncEnv';

const MAX_CONCURRENT = 2;
const LEASE_MS = 2200;
/** Repeated attempts against the same unresolved gap, within one cooldown window. */
const MAX_NO_PROGRESS_PULLS = 3;
const NO_PROGRESS_COOLDOWN_MS = 30_000;
type StalledPull = {
  cursor: number;
  head: number;
  attempts: number;
  lastAttemptAt: number;
  retryAt?: number;
};
const noProgressPulls = new Map<string, StalledPull>();
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

type Job = {
  contextType: ChatContextType;
  contextId: string;
  priority: number;
  expectedServerMaxSeq?: number;
  forcePull?: boolean;
};
const pending = new Map<string, Job>();
const deferredUntil = new Map<string, number>();
const active = new Set<string>();
let running = 0;
let generation = 0;
let wakeTimer: ReturnType<typeof setTimeout> | undefined;

type PullStart = { cursor: number; head: number; wait: number };

function mergeJobs(previous: Job | undefined, incoming: Job): Job {
  if (!previous) return incoming;
  const head = Math.max(previous.expectedServerMaxSeq ?? -1, incoming.expectedServerMaxSeq ?? -1);
  return {
    ...incoming,
    priority: Math.max(previous.priority, incoming.priority),
    ...(head >= 0 ? { expectedServerMaxSeq: head } : {}),
    ...(previous.forcePull || incoming.forcePull ? { forcePull: true } : {}),
  };
}

/** Failure backoff is unconditional; stalled-gap cooldowns expire when evidence changes. */
async function readPullStart(key: string, job: Job): Promise<PullStart> {
  const row = await chatLocalDb.chatThreads.get(key);
  const cursor = await getLocalCursorSeq(job.contextType, job.contextId);
  const head = job.expectedServerMaxSeq ?? row?.serverMaxSeq ?? 0;
  const now = Date.now();
  let stalled = noProgressPulls.get(key);
  if (stalled && (
    cursor !== stalled.cursor || head !== stalled.head ||
    now - (stalled.retryAt ?? stalled.lastAttemptAt) > NO_PROGRESS_COOLDOWN_MS
  )) {
    noProgressPulls.delete(key);
    stalled = undefined;
  }
  const failureWait = Math.max(0, (row?.nextRetryAt ?? 0) - now);
  const stalledWait = Math.max(0, (stalled?.retryAt ?? 0) - now);
  const leaseWait = job.priority >= SYNC_PRIORITY_GAP
    ? 0
    : Math.max(0, LEASE_MS - (now - (row?.lastPullStartedAt ?? 0)));
  return { cursor, head, wait: Math.max(failureWait, stalledWait, leaseWait) };
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

async function markPullEnd(key: string, start: PullStart, cursor: number): Promise<void> {
  const now = Date.now();
  // A caught-up check is healthy, even if it did not fetch or move the cursor.
  if (cursor > start.cursor || cursor >= start.head) {
    noProgressPulls.delete(key);
  } else {
    const previous = noProgressPulls.get(key);
    const attempts = (previous?.cursor === cursor && previous.head === start.head
      ? previous.attempts
      : 0) + 1;
    noProgressPulls.set(key, {
      cursor,
      head: start.head,
      attempts,
      lastAttemptAt: now,
      ...(attempts >= MAX_NO_PROGRESS_PULLS ? { retryAt: now + NO_PROGRESS_COOLDOWN_MS } : {}),
    });
  }
  const row = await chatLocalDb.chatThreads.get(key);
  if (!row) return;
  await chatLocalDb.chatThreads.put({
    ...row,
    updatedAt: now,
    lastSuccessfulPullAt: now,
    lastPullStartedAt: undefined,
    pullErrorAt: undefined,
    nextRetryAt: undefined,
  });
}

async function markPullFailed(key: string): Promise<void> {
  noProgressPulls.delete(key);
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

function deferJob(key: string, job: Job, wait: number): void {
  const newer = pending.get(key);
  pending.set(key, mergeJobs(job, newer ?? job));
  // Recheck a signal received during the asynchronous lease read before sleeping.
  deferredUntil.set(key, newer ? 0 : Date.now() + wait);
}

function scheduleWake(): void {
  if (wakeTimer != null) clearTimeout(wakeTimer);
  wakeTimer = undefined;
  let earliest = Infinity;
  for (const key of pending.keys()) {
    if (active.has(key)) continue;
    const due = deferredUntil.get(key);
    if (due != null && due > Date.now()) earliest = Math.min(earliest, due);
  }
  if (earliest !== Infinity) {
    wakeTimer = setTimeout(() => {
      wakeTimer = undefined;
      pump();
    }, Math.max(0, earliest - Date.now()));
  }
}

async function runJob(key: string, job: Job, startedGeneration: number): Promise<void> {
  let bannerStarted = false;
  try {
    const start = await readPullStart(key, job);
    if (startedGeneration !== generation) return;
    if (start.wait > 0) {
      deferJob(key, job, start.wait);
      return;
    }
    if (job.priority < SYNC_PRIORITY_GAP && shouldDeferLowPriorityChatSyncPull()) {
      deferJob(key, job, 1500);
      return;
    }
    if (job.priority <= SYNC_PRIORITY_COOP) {
      const now = Date.now();
      if (now - lowPriWindowStart > LOW_PRI_WINDOW_MS) {
        lowPriWindowStart = now;
        lowPriStartsInWindow = 0;
      }
      if (lowPriStartsInWindow >= LOW_PRI_MAX_STARTS_PER_WINDOW) {
        deferJob(key, job, 1400);
        return;
      }
      lowPriStartsInWindow += 1;
    }
    chatSyncPullStarted();
    bannerStarted = true;
    await markPullStart(key);
    await pullAndApplyChatSyncEvents(job.contextType, job.contextId, {
      ...(job.expectedServerMaxSeq != null ? { expectedServerMaxSeq: job.expectedServerMaxSeq } : {}),
      ...(job.forcePull ? { forcePull: true } : {}),
    });
    if (startedGeneration !== generation) return;
    const cursor = await getLocalCursorSeq(job.contextType, job.contextId);
    await markPullEnd(key, start, cursor);
  } catch (error) {
    if (startedGeneration !== generation) return;
    if (job.contextType === 'GAME' && isGameChatContextGoneHttpError(error)) {
      await purgeGameChatLocal(job.contextId);
      cancelChatSyncPull(job.contextType, job.contextId);
    } else {
      recordChatSyncPullFailure();
      await markPullFailed(key);
    }
  } finally {
    if (bannerStarted && startedGeneration === generation) chatSyncPullEnded();
    active.delete(key);
    running--;
    pump();
  }
}

function pump(): void {
  while (running < MAX_CONCURRENT) {
    const now = Date.now();
    const job = [...pending.values()]
      .filter((candidate) => {
        const key = chatCursorKey(candidate.contextType, candidate.contextId);
        return !active.has(key) && (deferredUntil.get(key) ?? 0) <= now;
      })
      .sort((a, b) => b.priority - a.priority)[0];
    if (!job) break;
    const key = chatCursorKey(job.contextType, job.contextId);
    pending.delete(key);
    deferredUntil.delete(key);
    active.add(key);
    running++;
    void runJob(key, job, generation);
  }
  scheduleWake();
}

export function enqueueChatSyncPull(
  contextType: ChatContextType,
  contextId: string,
  priority: number = SYNC_PRIORITY_WARM,
  options?: { expectedServerMaxSeq?: number; forcePull?: boolean }
): void {
  const key = chatCursorKey(contextType, contextId);
  pending.set(key, mergeJobs(pending.get(key), { contextType, contextId, priority, ...options }));
  // A new signal may reflect cursor/head progress. Recheck it; readPullStart still
  // enforces real failure backoff at every priority.
  deferredUntil.delete(key);
  if (import.meta.env.DEV && pending.size > 40) {
    console.warn('[chatSync] pull queue depth', pending.size);
  }
  pump();
}

export function clearChatSyncScheduler(): void {
  generation += 1;
  pending.clear();
  deferredUntil.clear();
  if (wakeTimer != null) clearTimeout(wakeTimer);
  wakeTimer = undefined;
  noProgressPulls.clear();
  resetLowPriorityChatSyncPullBudget();
  resetChatSyncMetrics();
  resetChatSyncPullDepth();
}

/** Drop a queued pull so a just-purged thread is not immediately re-fetched. */
export function cancelChatSyncPull(contextType: ChatContextType, contextId: string): void {
  const key = chatCursorKey(contextType, contextId);
  pending.delete(key);
  deferredUntil.delete(key);
  noProgressPulls.delete(key);
  scheduleWake();
}
