import type { ChatContextType } from '@/api/chat';
import { chatApi } from '@/api/chat';
import { useAuthStore } from '@/store/authStore';
import { usePlayersStore } from '@/store/playersStore';
import { chatCursorKey, chatLocalDb } from './chatLocalDb';
import { getLocalCursorSeq } from './chatLocalApply';
import { enqueueChatSyncPull, SYNC_PRIORITY_UNREAD, SYNC_PRIORITY_WARM } from './chatSyncScheduler';
import type { UnreadObjectsApiPayload, UnreadObjectsWarmInner } from './chatUnreadPayload';
import { unreadApiEnvelopeData, unreadContextKeysFromPayload, unreadPayloadToWarmInner } from './chatUnreadPayload';
import { parsePositiveIntEnv } from './chatSyncEnv';

const MAX_BATCH = 120;
const MAX_SCHEDULED_PULL_IMMEDIATE = parsePositiveIntEnv(
  import.meta.env.VITE_CHAT_SYNC_WARM_MAX_PULL_IMMEDIATE,
  40
);
const WARM_DRAIN_BATCH = parsePositiveIntEnv(import.meta.env.VITE_CHAT_SYNC_WARM_DRAIN_BATCH, 24);
const WARM_DRAIN_INTERVAL_MS = parsePositiveIntEnv(import.meta.env.VITE_CHAT_SYNC_WARM_DRAIN_INTERVAL_MS, 1600);
const IMPLICIT_WARM_COOLDOWN_MS = 10_000;

export type UnreadObjectsInner = UnreadObjectsWarmInner;

let implicitWarmCooldownUntil = 0;
let sessionWarmBootstrapDone = false;
type WarmDrainItem = { contextType: ChatContextType; contextId: string; priority: number };
const warmDrainQueue: WarmDrainItem[] = [];
let warmDrainTimer: ReturnType<typeof setTimeout> | null = null;

let warmSerialTail: Promise<void> = Promise.resolve();

function enqueueWarmSerial(fn: () => Promise<void>): Promise<void> {
  const run = warmSerialTail.then(fn);
  warmSerialTail = run.catch(() => {});
  return run;
}

let warmFromPayloadTimer: ReturnType<typeof setTimeout> | null = null;
let warmFromPayloadPendingInner: UnreadObjectsWarmInner | null | undefined;
let warmFromPayloadPendingFull: UnreadObjectsApiPayload | null | undefined;

function scheduleWarmDrain(delayMs: number): void {
  if (warmDrainTimer != null) return;
  warmDrainTimer = setTimeout(() => {
    warmDrainTimer = null;
    const seen = new Set<string>();
    let n = 0;
    while (warmDrainQueue.length > 0 && n < WARM_DRAIN_BATCH) {
      const it = warmDrainQueue.shift()!;
      const k = `${it.contextType}:${it.contextId}`;
      if (seen.has(k)) continue;
      seen.add(k);
      enqueueChatSyncPull(it.contextType, it.contextId, it.priority);
      n++;
    }
    if (warmDrainQueue.length > 0) scheduleWarmDrain(WARM_DRAIN_INTERVAL_MS);
  }, delayMs);
}

function enqueueWarmOverflow(
  items: Array<{ contextType: ChatContextType; contextId: string }>,
  unreadKeys?: Set<string>
): void {
  const seen = new Set(warmDrainQueue.map((x) => `${x.contextType}:${x.contextId}`));
  for (const it of items) {
    const k = `${it.contextType}:${it.contextId}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const priority = unreadKeys?.has(k) ? SYNC_PRIORITY_UNREAD : SYNC_PRIORITY_WARM;
    warmDrainQueue.push({ contextType: it.contextType, contextId: it.contextId, priority });
  }
  scheduleWarmDrain(0);
}

export function clearChatSyncWarmDrainQueue(): void {
  warmDrainQueue.length = 0;
  if (warmDrainTimer != null) {
    clearTimeout(warmDrainTimer);
    warmDrainTimer = null;
  }
}

export async function collectContextsForWarm(): Promise<Array<{ contextType: ChatContextType; contextId: string }>> {
  const map = new Map<string, { contextType: ChatContextType; contextId: string }>();
  try {
    const rows = await chatLocalDb.threadIndex.toArray();
    for (const r of rows) {
      const k = `${r.contextType}:${r.contextId}`;
      map.set(k, { contextType: r.contextType, contextId: r.contextId });
    }
  } catch {
    /* db upgrading */
  }
  const chats = usePlayersStore.getState().chats;
  for (const id of Object.keys(chats)) {
    map.set(`USER:${id}`, { contextType: 'USER', contextId: id });
  }
  return [...map.values()];
}

function mergeUnreadIntoContextMap(
  map: Map<string, { contextType: ChatContextType; contextId: string }>,
  inner: UnreadObjectsWarmInner | null | undefined
): void {
  if (!inner) return;
  for (const g of inner.games ?? []) {
    const id = g.game?.id;
    if (id) map.set(`GAME:${id}`, { contextType: 'GAME', contextId: id });
  }
  for (const b of inner.bugs ?? []) {
    const id = b.bug?.id;
    if (id) map.set(`BUG:${id}`, { contextType: 'BUG', contextId: id });
  }
  for (const u of inner.userChats ?? []) {
    const id = u.chat?.id;
    if (id) map.set(`USER:${id}`, { contextType: 'USER', contextId: id });
  }
  for (const gc of inner.groupChannels ?? []) {
    const id = gc.groupChannel?.id;
    if (id) map.set(`GROUP:${id}`, { contextType: 'GROUP', contextId: id });
  }
  for (const m of inner.marketItems ?? []) {
    const id = m.groupChannelId;
    if (id) map.set(`GROUP:${id}`, { contextType: 'GROUP', contextId: id });
  }
}

async function collectContextsWarmListWithUnreadKeys(): Promise<{
  list: Array<{ contextType: ChatContextType; contextId: string }>;
  unreadKeys: Set<string>;
}> {
  const map = new Map<string, { contextType: ChatContextType; contextId: string }>();
  for (const it of await collectContextsForWarm()) {
    map.set(`${it.contextType}:${it.contextId}`, it);
  }
  let unreadKeys = new Set<string>();
  if (useAuthStore.getState().token) {
    try {
      const res = await chatApi.getUnreadObjects();
      const payload = unreadApiEnvelopeData(res);
      mergeUnreadIntoContextMap(map, payload ? unreadPayloadToWarmInner(payload) : undefined);
      unreadKeys = unreadContextKeysFromPayload(payload);
    } catch {
      /* offline */
    }
  }
  return { list: [...map.values()], unreadKeys };
}

export async function collectContextsForWarmEnriched(): Promise<
  Array<{ contextType: ChatContextType; contextId: string }>
> {
  const { list } = await collectContextsWarmListWithUnreadKeys();
  return list;
}

export function resetChatSyncWarmSession(): void {
  sessionWarmBootstrapDone = false;
  implicitWarmCooldownUntil = 0;
  if (warmFromPayloadTimer) {
    clearTimeout(warmFromPayloadTimer);
    warmFromPayloadTimer = null;
  }
  warmFromPayloadPendingInner = undefined;
  warmFromPayloadPendingFull = undefined;
}

export function scheduleWarmFromUnreadApiPayload(payload: UnreadObjectsApiPayload | null | undefined): void {
  if (!payload) return;
  warmFromPayloadPendingFull = payload;
  warmFromPayloadPendingInner = unreadPayloadToWarmInner(payload);
  if (warmFromPayloadTimer) clearTimeout(warmFromPayloadTimer);
  warmFromPayloadTimer = setTimeout(() => {
    warmFromPayloadTimer = null;
    const inner = warmFromPayloadPendingInner;
    warmFromPayloadPendingInner = undefined;
    const full = warmFromPayloadPendingFull;
    warmFromPayloadPendingFull = undefined;
    const unreadKeys = unreadContextKeysFromPayload(full ?? undefined);
    void enqueueWarmSerial(() => warmChatSyncHeadsWithUnreadInnerRun(inner, unreadKeys));
  }, 450);
}

async function warmChatSyncHeadsWithUnreadInnerRun(
  inner: UnreadObjectsWarmInner | null | undefined,
  unreadKeys: Set<string>
): Promise<void> {
  if (!useAuthStore.getState().token) return;
  const map = new Map<string, { contextType: ChatContextType; contextId: string }>();
  for (const it of await collectContextsForWarm()) {
    map.set(`${it.contextType}:${it.contextId}`, it);
  }
  mergeUnreadIntoContextMap(map, inner);
  const list = [...map.values()];
  if (list.length === 0) return;
  try {
    await runWarmBody(list, unreadKeys);
  } catch {
    /* offline */
  }
}

export function warmChatSyncHeadsWithUnreadInner(inner: UnreadObjectsWarmInner | null | undefined): Promise<void> {
  return enqueueWarmSerial(() => warmChatSyncHeadsWithUnreadInnerRun(inner, new Set()));
}

export function ensureChatSyncWarmBootstrap(): Promise<void> {
  if (!useAuthStore.getState().token || sessionWarmBootstrapDone) return Promise.resolve();
  sessionWarmBootstrapDone = true;
  return enqueueWarmSerial(async () => {
    try {
      const { hydrateAllChatSyncTailsFromDexie } = await import('@/services/chat/chatTailHydrate');
      await hydrateAllChatSyncTailsFromDexie();
    } catch {
      /* ignore */
    }
    try {
      const { list, unreadKeys } = await collectContextsWarmListWithUnreadKeys();
      if (list.length > 0) await runWarmBody(list, unreadKeys);
    } catch {
      /* offline */
    } finally {
      implicitWarmCooldownUntil = Date.now() + IMPLICIT_WARM_COOLDOWN_MS;
      const { scheduleChatHotThreadPrefetchFromIdle } = await import('./chatHotThreadPrefetch');
      scheduleChatHotThreadPrefetchFromIdle();
    }
  });
}

function pullPriorityForWarmItem(
  it: { contextType: ChatContextType; contextId: string },
  unreadKeys?: Set<string>
): number {
  const k = `${it.contextType}:${it.contextId}`;
  if (unreadKeys?.has(k)) return SYNC_PRIORITY_UNREAD;
  return SYNC_PRIORITY_WARM;
}

async function messageContextHeadReferencesMissingRow(
  contextType: ChatContextType,
  contextId: string
): Promise<boolean> {
  if (contextType === 'GAME') {
    const prefix = `GAME:${contextId}:`;
    const heads = await chatLocalDb.messageContextHead
      .where('key')
      .between(prefix, `${prefix}\uffff`, true, true)
      .toArray();
    if (heads.length === 0) return false;
    for (const h of heads) {
      if (!h.latestMessageId) continue;
      const row = await chatLocalDb.messages.get(h.latestMessageId);
      if (row == null || row.deletedAt != null) return true;
    }
    return false;
  }
  const head = await chatLocalDb.messageContextHead.get(`${contextType}:${contextId}`);
  if (!head?.latestMessageId) return false;
  const row = await chatLocalDb.messages.get(head.latestMessageId);
  return row == null || row.deletedAt != null;
}

async function runWarmBody(
  list: Array<{ contextType: ChatContextType; contextId: string }>,
  unreadKeys?: Set<string>
): Promise<void> {
  if (list.length === 0) return;
  const map = new Map<string, { contextType: ChatContextType; contextId: string }>();
  for (const it of list) {
    map.set(`${it.contextType}:${it.contextId}`, it);
  }
  const unique = Array.from(map.values());
  const chunks: (typeof unique)[] = [];
  for (let i = 0; i < unique.length; i += MAX_BATCH) {
    chunks.push(unique.slice(i, i + MAX_BATCH));
  }
  const toSchedule: typeof unique = [];
  for (const chunk of chunks) {
    const heads = await chatApi.postChatSyncBatchHead(chunk);
    for (const it of chunk) {
      const k = chatCursorKey(it.contextType, it.contextId);
      const max = heads[k] ?? 0;
      const prev = await chatLocalDb.chatThreads.get(k);
      await chatLocalDb.chatThreads.put({
        ...(prev ?? { key: k, serverMaxSeq: 0, updatedAt: Date.now() }),
        key: k,
        serverMaxSeq: max,
        updatedAt: Date.now(),
      });
      const local = await getLocalCursorSeq(it.contextType, it.contextId);
      const headBroken =
        max > 0 && (await messageContextHeadReferencesMissingRow(it.contextType, it.contextId));
      if (max > local || headBroken) toSchedule.push(it);
    }
  }
  const immediate = toSchedule.slice(0, MAX_SCHEDULED_PULL_IMMEDIATE);
  const overflow = toSchedule.slice(MAX_SCHEDULED_PULL_IMMEDIATE);
  for (const it of immediate) {
    enqueueChatSyncPull(it.contextType, it.contextId, pullPriorityForWarmItem(it, unreadKeys));
  }
  if (overflow.length) enqueueWarmOverflow(overflow, unreadKeys);
}

export type WarmChatSyncHeadsOptions = {
  skipCooldown?: boolean;
  enrichFromUnread?: boolean;
};

export function warmChatSyncHeads(
  items?: Array<{ contextType: ChatContextType; contextId: string }>,
  options?: WarmChatSyncHeadsOptions
): Promise<void> {
  return enqueueWarmSerial(async () => {
    if (!useAuthStore.getState().token) return;
    const explicit = !!(items && items.length > 0);
    const now = Date.now();
    if (!explicit && !options?.skipCooldown && now < implicitWarmCooldownUntil) return;
    let list: Array<{ contextType: ChatContextType; contextId: string }>;
    let unreadKeys: Set<string> | undefined;
    if (explicit) {
      list = items!;
    } else if (options?.enrichFromUnread) {
      const enriched = await collectContextsWarmListWithUnreadKeys();
      list = enriched.list;
      unreadKeys = enriched.unreadKeys;
    } else {
      list = await collectContextsForWarm();
    }
    try {
      await runWarmBody(list, unreadKeys);
      if (!explicit && !options?.skipCooldown) {
        implicitWarmCooldownUntil = Date.now() + IMPLICIT_WARM_COOLDOWN_MS;
      }
    } catch {
      /* offline — do not advance implicit cooldown */
    }
  });
}

export function runChatSyncBatchWarmOnConnect(): void {
  void warmChatSyncHeads();
}
