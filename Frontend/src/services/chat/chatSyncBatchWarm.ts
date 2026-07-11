import type { ChatContextType } from '@/api/chat';
import { chatApi } from '@/api/chat';
import { useAuthStore } from '@/store/authStore';
import { usePlayersStore } from '@/store/playersStore';
import { chatCursorKey, chatLocalDb } from './chatLocalDb';
import { getLocalCursorSeq } from './chatLocalApply';
import { parseChatThreadCursorKey } from './chatThreadCursorKeyParse';
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
const WARM_DRAIN_BOOTSTRAP_INTERVAL_MS = parsePositiveIntEnv(
  import.meta.env.VITE_CHAT_SYNC_WARM_DRAIN_BOOTSTRAP_INTERVAL_MS,
  4000
);
const HOT_THREAD_TOP_K = parsePositiveIntEnv(import.meta.env.VITE_CHAT_SYNC_WARM_HOT_TOP_K, 5);
const IMPLICIT_WARM_COOLDOWN_MS = 10_000;

export type WarmPullPolicy = 'full' | 'tiered-bootstrap';

export type UnreadObjectsInner = UnreadObjectsWarmInner;

let implicitWarmCooldownUntil = 0;
let sessionWarmBootstrapDone = false;
type WarmDrainItem = {
  contextType: ChatContextType;
  contextId: string;
  priority: number;
  expectedServerMaxSeq?: number;
};
const warmDrainQueue: WarmDrainItem[] = [];
let warmDrainTimer: ReturnType<typeof setTimeout> | null = null;
type HeldBootstrapOverflowItem = {
  contextType: ChatContextType;
  contextId: string;
  expectedServerMaxSeq?: number;
};
const heldBootstrapOverflow: HeldBootstrapOverflowItem[] = [];

let warmSerialTail: Promise<void> = Promise.resolve();
let implicitWarmInFlight: Promise<void> | null = null;
let lastRunWarmBodyAt = 0;
let pendingChatsTabFullWarm = false;

function isImplicitWarmCooldownActive(): boolean {
  return Date.now() < implicitWarmCooldownUntil;
}

/** Skip redundant warm / batch-head when bootstrap or another warm just ran. */
export function shouldDeferImplicitChatWarm(): boolean {
  return (
    implicitWarmInFlight != null ||
    isImplicitWarmCooldownActive() ||
    Date.now() - lastRunWarmBodyAt < IMPLICIT_WARM_COOLDOWN_MS
  );
}

/** Skip duplicate full-thread warms right after bootstrap / implicit warm. */
function shouldSkipRedundantImplicitWarm(): boolean {
  return implicitWarmInFlight != null || isImplicitWarmCooldownActive();
}

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
      enqueueChatSyncPull(
        it.contextType,
        it.contextId,
        it.priority,
        it.expectedServerMaxSeq != null
          ? { expectedServerMaxSeq: it.expectedServerMaxSeq }
          : undefined
      );
      n++;
    }
    if (warmDrainQueue.length > 0) scheduleWarmDrain(WARM_DRAIN_INTERVAL_MS);
  }, delayMs);
}

function enqueueWarmOverflow(
  items: Array<{ contextType: ChatContextType; contextId: string; expectedServerMaxSeq?: number }>,
  unreadKeys?: Set<string>,
  initialDelayMs = 0
): void {
  const seen = new Set(warmDrainQueue.map((x) => `${x.contextType}:${x.contextId}`));
  for (const it of items) {
    const k = `${it.contextType}:${it.contextId}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const priority = unreadKeys?.has(k) ? SYNC_PRIORITY_UNREAD : SYNC_PRIORITY_WARM;
    const item: WarmDrainItem = {
      contextType: it.contextType,
      contextId: it.contextId,
      priority,
    };
    if (it.expectedServerMaxSeq != null) item.expectedServerMaxSeq = it.expectedServerMaxSeq;
    warmDrainQueue.push(item);
  }
  scheduleWarmDrain(initialDelayMs);
}

function holdBootstrapOverflow(
  items: Array<{ contextType: ChatContextType; contextId: string; expectedServerMaxSeq?: number }>
): void {
  const seen = new Set(heldBootstrapOverflow.map((x) => `${x.contextType}:${x.contextId}`));
  for (const it of items) {
    const k = `${it.contextType}:${it.contextId}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const item: HeldBootstrapOverflowItem = {
      contextType: it.contextType,
      contextId: it.contextId,
    };
    if (it.expectedServerMaxSeq != null) item.expectedServerMaxSeq = it.expectedServerMaxSeq;
    heldBootstrapOverflow.push(item);
  }
}

function flushHeldBootstrapOverflow(): void {
  if (heldBootstrapOverflow.length === 0) return;
  const batch = heldBootstrapOverflow.splice(0);
  enqueueWarmOverflow(batch, undefined, 0);
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

async function collectContextsWarmListWithUnreadKeys(options?: {
  skipUnreadFetch?: boolean;
}): Promise<{
  list: Array<{ contextType: ChatContextType; contextId: string }>;
  unreadKeys: Set<string>;
}> {
  const map = new Map<string, { contextType: ChatContextType; contextId: string }>();
  for (const it of await collectContextsForWarm()) {
    map.set(`${it.contextType}:${it.contextId}`, it);
  }
  let unreadKeys = new Set<string>();
  if (options?.skipUnreadFetch) {
    const { useUnreadStore } = await import('@/store/unreadStore');
    const { baseByContext } = useUnreadStore.getState();
    for (const [key, count] of Object.entries(baseByContext)) {
      if (count > 0) unreadKeys.add(key);
    }
  } else if (useAuthStore.getState().token) {
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
  pendingChatsTabFullWarm = false;
  implicitWarmCooldownUntil = 0;
  lastRunWarmBodyAt = 0;
  heldBootstrapOverflow.length = 0;
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
    if (shouldSkipRedundantImplicitWarm()) return;
    const unreadKeys = unreadContextKeysFromPayload(full ?? undefined);
    void enqueueWarmSerial(() => warmChatSyncHeadsWithUnreadInnerRun(inner, unreadKeys));
  }, 450);
}

async function warmChatSyncHeadsWithUnreadInnerRun(
  inner: UnreadObjectsWarmInner | null | undefined,
  unreadKeys: Set<string>
): Promise<void> {
  if (!useAuthStore.getState().token) return;
  if (shouldSkipRedundantImplicitWarm()) return;
  const map = new Map<string, { contextType: ChatContextType; contextId: string }>();
  for (const it of await collectContextsForWarm()) {
    map.set(`${it.contextType}:${it.contextId}`, it);
  }
  mergeUnreadIntoContextMap(map, inner);
  const list = [...map.values()];
  if (list.length === 0) return;
  try {
    await runWarmBody(list, unreadKeys, { pullPolicy: 'tiered-bootstrap' });
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
  const run = enqueueWarmSerial(async () => {
    try {
      const { hydrateAllChatSyncTailsFromDexie } = await import('@/services/chat/chatTailHydrate');
      await hydrateAllChatSyncTailsFromDexie();
    } catch {
      /* ignore */
    }
    const { useUnreadStore, isUnreadStoreWarm } = await import('@/store/unreadStore');
    const unreadState = useUnreadStore.getState();
    if (unreadState.refreshInFlight) {
      try {
        await unreadState.refreshInFlight;
      } catch {
        /* refresh failed — still warm from local contexts */
      }
    } else if (!isUnreadStoreWarm(unreadState)) {
      try {
        await unreadState.refreshAll();
      } catch {
        /* refresh failed — still warm from local contexts */
      }
    }
    try {
      const { list, unreadKeys } = await collectContextsWarmListWithUnreadKeys({ skipUnreadFetch: true });
      if (list.length > 0) await runWarmBody(list, unreadKeys, { pullPolicy: 'tiered-bootstrap' });
    } catch {
      /* offline */
    } finally {
      implicitWarmCooldownUntil = Date.now() + IMPLICIT_WARM_COOLDOWN_MS;
      const { scheduleChatHotThreadPrefetchFromIdle } = await import('./chatHotThreadPrefetch');
      scheduleChatHotThreadPrefetchFromIdle();
    }
  });
  implicitWarmInFlight = run;
  void run.finally(() => {
    if (implicitWarmInFlight === run) implicitWarmInFlight = null;
  });
  return run;
}

function pullPriorityForWarmItem(
  it: { contextType: ChatContextType; contextId: string },
  unreadKeys?: Set<string>
): number {
  const k = `${it.contextType}:${it.contextId}`;
  if (unreadKeys?.has(k)) return SYNC_PRIORITY_UNREAD;
  return SYNC_PRIORITY_WARM;
}

function scoreWarmThreadRow(row: { openCount?: number; lastOpenedAt?: number }): number {
  const oc = row.openCount ?? 0;
  const la = row.lastOpenedAt ?? 0;
  return oc * 1_000_000 + la;
}

async function collectHotThreadKeys(): Promise<Set<string>> {
  try {
    const openScores = new Map<string, number>();
    const metaRows = await chatLocalDb.chatThreads.toArray();
    for (const r of metaRows) {
      if (r.lastOpenedAt == null || r.lastOpenedAt <= 0) continue;
      const parsed = parseChatThreadCursorKey(r.key);
      if (!parsed) continue;
      const k = `${parsed.contextType}:${parsed.contextId}`;
      openScores.set(k, Math.max(openScores.get(k) ?? 0, scoreWarmThreadRow(r)));
    }

    const hotKeys = new Set(
      [...openScores.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, HOT_THREAD_TOP_K)
        .map(([k]) => k)
    );
    if (hotKeys.size >= HOT_THREAD_TOP_K) return hotKeys;

    const activityScores = new Map<string, number>();
    const indexRows = await chatLocalDb.threadIndex.toArray();
    for (const r of indexRows) {
      const sortAt = r.sortAt ?? 0;
      if (sortAt <= 0) continue;
      const k = `${r.contextType}:${r.contextId}`;
      if (openScores.has(k)) continue;
      activityScores.set(k, Math.max(activityScores.get(k) ?? 0, sortAt));
    }
    const slotsLeft = HOT_THREAD_TOP_K - hotKeys.size;
    for (const [k] of [...activityScores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, slotsLeft)) {
      hotKeys.add(k);
    }
    return hotKeys;
  } catch {
    return new Set();
  }
}

async function partitionScheduledPulls(
  toSchedule: Array<{ contextType: ChatContextType; contextId: string; expectedServerMaxSeq: number }>,
  unreadKeys: Set<string> | undefined,
  pullPolicy: WarmPullPolicy
): Promise<{
  immediate: typeof toSchedule;
  overflow: typeof toSchedule;
  drainDelayMs: number;
}> {
  if (pullPolicy === 'full') {
    return {
      immediate: toSchedule.slice(0, MAX_SCHEDULED_PULL_IMMEDIATE),
      overflow: toSchedule.slice(MAX_SCHEDULED_PULL_IMMEDIATE),
      drainDelayMs: 0,
    };
  }
  const hotKeys = await collectHotThreadKeys();
  const immediate: typeof toSchedule = [];
  const overflow: typeof toSchedule = [];
  for (const it of toSchedule) {
    const k = `${it.contextType}:${it.contextId}`;
    const tierEligible = unreadKeys?.has(k) === true || hotKeys.has(k);
    if (tierEligible && immediate.length < MAX_SCHEDULED_PULL_IMMEDIATE) {
      immediate.push(it);
    } else {
      overflow.push(it);
    }
  }
  return { immediate, overflow, drainDelayMs: WARM_DRAIN_BOOTSTRAP_INTERVAL_MS };
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
  unreadKeys?: Set<string>,
  options?: { force?: boolean; pullPolicy?: WarmPullPolicy }
): Promise<void> {
  if (list.length === 0) return;
  const now = Date.now();
  if (!options?.force && now - lastRunWarmBodyAt < IMPLICIT_WARM_COOLDOWN_MS) return;
  lastRunWarmBodyAt = now;
  const map = new Map<string, { contextType: ChatContextType; contextId: string }>();
  for (const it of list) {
    map.set(`${it.contextType}:${it.contextId}`, it);
  }
  const unique = Array.from(map.values());
  const chunks: (typeof unique)[] = [];
  for (let i = 0; i < unique.length; i += MAX_BATCH) {
    chunks.push(unique.slice(i, i + MAX_BATCH));
  }
  const toSchedule: Array<(typeof unique)[number] & { expectedServerMaxSeq: number }> = [];
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
      if (max > local || headBroken) toSchedule.push({ ...it, expectedServerMaxSeq: max });
    }
  }
  const pullPolicy = options?.pullPolicy ?? 'full';
  const { immediate, overflow, drainDelayMs } = await partitionScheduledPulls(
    toSchedule,
    unreadKeys,
    pullPolicy
  );
  for (const it of immediate) {
    enqueueChatSyncPull(it.contextType, it.contextId, pullPriorityForWarmItem(it, unreadKeys), {
      expectedServerMaxSeq: it.expectedServerMaxSeq,
    });
  }
  if (overflow.length) {
    if (pullPolicy === 'tiered-bootstrap') {
      holdBootstrapOverflow(overflow);
    } else {
      enqueueWarmOverflow(overflow, unreadKeys, drainDelayMs);
    }
  }
}

export type WarmChatSyncHeadsOptions = {
  skipCooldown?: boolean;
  enrichFromUnread?: boolean;
  pullPolicy?: WarmPullPolicy;
  /** Internal: set when chaining full warm after tiered bootstrap completes. */
  chainedAfterImplicit?: boolean;
};

export function warmChatSyncHeads(
  items?: Array<{ contextType: ChatContextType; contextId: string }>,
  options?: WarmChatSyncHeadsOptions
): Promise<void> {
  const explicit = !!(items && items.length > 0);
  const wantsChatsTabFullWarm =
    !explicit &&
    options?.skipCooldown === true &&
    options?.pullPolicy === 'full' &&
    !options?.chainedAfterImplicit;
  if (!explicit && implicitWarmInFlight != null) {
    if (wantsChatsTabFullWarm) {
      pendingChatsTabFullWarm = true;
      return implicitWarmInFlight.finally(() => {
        if (!pendingChatsTabFullWarm) return;
        pendingChatsTabFullWarm = false;
        return warmChatSyncHeads(undefined, {
          enrichFromUnread: true,
          skipCooldown: true,
          pullPolicy: 'full',
          chainedAfterImplicit: true,
        });
      });
    }
    return implicitWarmInFlight;
  }
  const run = enqueueWarmSerial(async () => {
    if (!useAuthStore.getState().token) return;
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
      const bypassRunBodyCooldown =
        explicit || (options?.skipCooldown === true && options?.pullPolicy === 'full');
      await runWarmBody(list, unreadKeys, {
        force: bypassRunBodyCooldown,
        pullPolicy: options?.pullPolicy ?? 'full',
      });
      if (!explicit && !options?.skipCooldown) {
        implicitWarmCooldownUntil = Date.now() + IMPLICIT_WARM_COOLDOWN_MS;
      }
    } catch {
      /* offline — do not advance implicit cooldown */
    }
  });
  if (!explicit) {
    implicitWarmInFlight = run;
    void run.finally(() => {
      if (implicitWarmInFlight === run) implicitWarmInFlight = null;
    });
  }
  return run;
}

export function runChatSyncBatchWarmOnConnect(): void {
  void warmChatSyncHeads();
}

/** Full warm when user opens Chats tab — drains deferred bootstrap threads promptly. */
export function warmChatSyncHeadsOnChatsTabIntent(): void {
  flushHeldBootstrapOverflow();
  void warmChatSyncHeads(undefined, { enrichFromUnread: true, skipCooldown: true, pullPolicy: 'full' });
}

/** Awaits in-flight / queued implicit warm work (for tests). */
export function awaitChatSyncWarmIdle(): Promise<void> {
  return warmSerialTail;
}
