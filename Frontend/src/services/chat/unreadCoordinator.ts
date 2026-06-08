import { chatApi, type ChatContextType } from '@/api/chat';
import type { ChatType } from '@/types';
import { getGameChatTypesForUnreadAndMarkRead } from '@/utils/gameChatTypesForUnread';
import { useGameDetailsChromeStore } from '@/components/GameDetails/gameDetailsChromeStore';
import { useUnreadStore, type EnterContextParams } from '@/store/unreadStore';
import {
  computeTotals,
  contextKey,
  parseContextKey,
  type ComputeTotalsMeta,
  type ContextKey,
  type MarkContextReadRequest,
  type SnapshotContextType,
} from '@/services/chat/unreadSnapshot';
import { shouldQueueChatMutation } from '@/services/chat/chatMutationNetwork';
import { OfflineIntent } from '@/services/chat/offlineIntent';
import { scheduleChatOpenIdle } from '@/utils/chatOpenIdle';

export type CoordinatorEnterParams = EnterContextParams & {
  rawContextType?: ChatContextType;
  gameChatType?: ChatType;
  /** When raw route uses BUG id, pass resolved group channel id for mark/count key. */
  groupChannelId?: string;
};

const pendingRestoreByKey = new Map<ContextKey, number>();
const activityNetworkTimers = new Map<ContextKey, ReturnType<typeof setTimeout>>();
const markReadConfirmedKeys = new Set<ContextKey>();
const ACTIVITY_MARK_DEBOUNCE_MS = 280;

/** Cleared when socket reports unread > 0 for this context (see unreadStore.applySocketDelta). */
export function invalidateMarkReadConfirmed(key: ContextKey): void {
  markReadConfirmedKeys.delete(key);
}

function confirmMarkRead(key: ContextKey): void {
  markReadConfirmedKeys.add(key);
}

/** Phase 4.6 / Bug L: skip redundant mark-context-read when already read locally. */
function shouldSkipMarkReadNetwork(key: ContextKey): boolean {
  const state = useUnreadStore.getState();
  if ((state.byContext[key] ?? 0) > 0) return false;
  if (pendingRestoreByKey.has(key)) return false;
  return markReadConfirmedKeys.has(key);
}

/** Skip enter optimistic UI when already in context with no local unread (still schedule server sync). */
function shouldSkipEnterOptimistic(key: ContextKey, state: ReturnType<typeof useUnreadStore.getState>): boolean {
  if (state.lastEnteredContextKey !== key || !isViewingContextKey(key)) return false;
  return (state.byContext[key] ?? 0) === 0;
}

function ensureMarkInFlight(key: ContextKey): void {
  const state = useUnreadStore.getState();
  if (state.markInFlight.has(key)) return;
  const markInFlight = new Set(state.markInFlight);
  markInFlight.add(key);
  useUnreadStore.setState({ markInFlight });
}

function resolveSnapshotContext(
  params: CoordinatorEnterParams
): { snapshotType: SnapshotContextType; contextId: string; key: ContextKey } | null {
  const raw = params.rawContextType ?? params.contextType;
  if (raw === 'GAME') {
    return {
      snapshotType: 'GAME',
      contextId: params.contextId,
      key: contextKey('GAME', params.contextId),
    };
  }
  if (raw === 'USER') {
    return {
      snapshotType: 'USER',
      contextId: params.contextId,
      key: contextKey('USER', params.contextId),
    };
  }
  if (raw === 'GROUP') {
    return {
      snapshotType: 'GROUP',
      contextId: params.contextId,
      key: contextKey('GROUP', params.contextId),
    };
  }
  if (raw === 'BUG') {
    const channelId =
      params.groupChannelId ??
      params.contextId ??
      resolveGroupChannelIdForBug(params.contextId);
    if (!channelId) return null;
    return {
      snapshotType: 'GROUP',
      contextId: channelId,
      key: contextKey('GROUP', channelId),
    };
  }
  return {
    snapshotType: params.contextType,
    contextId: params.contextId,
    key: contextKey(params.contextType, params.contextId),
  };
}

function resolveGroupChannelIdForBug(bugId: string): string | null {
  const meta = useUnreadStore.getState().groupChannelMeta;
  for (const [channelId, gm] of Object.entries(meta)) {
    if (gm.bugId === bugId) return channelId;
  }
  return null;
}

function isViewingContextKey(key: ContextKey): boolean {
  const parsed = parseContextKey(key);
  if (!parsed) return false;
  const nav = useGameDetailsChromeStore.getState();
  if (parsed.contextType === 'GAME') return nav.viewingGameChatId === parsed.contextId;
  if (parsed.contextType === 'USER') return nav.viewingUserChatId === parsed.contextId;
  if (parsed.contextType === 'GROUP') return nav.viewingGroupChannelId === parsed.contextId;
  return false;
}

function setViewingBeforeMark(params: CoordinatorEnterParams, resolved: ReturnType<typeof resolveSnapshotContext>): void {
  if (!resolved) return;
  const raw = params.rawContextType ?? params.contextType;
  const { contextId } = resolved;
  if (raw === 'GROUP' || raw === 'BUG') {
    useGameDetailsChromeStore.getState().setViewingGroupChannelId(contextId);
    return;
  }
  if (raw === 'USER') {
    useGameDetailsChromeStore.getState().setViewingUserChatId(contextId);
    return;
  }
  if (raw === 'GAME') {
    useGameDetailsChromeStore.getState().setViewingGameChat(contextId, params.gameChatType ?? null);
  }
}

function optimisticClear(key: ContextKey): number {
  invalidateMarkReadConfirmed(key);
  const state = useUnreadStore.getState();
  const prev = state.byContext[key] ?? 0;

  const markInFlight = new Set(state.markInFlight);
  markInFlight.add(key);
  const meta: ComputeTotalsMeta = {
    groupChannelMeta: state.groupChannelMeta,
    mutedGroupIds: state.mutedGroupIds,
  };
  const nextByContext = { ...state.byContext };
  delete nextByContext[key];
  useUnreadStore.setState({
    byContext: nextByContext,
    totals: computeTotals(nextByContext, meta),
    markInFlight,
    lastEnteredContextKey: key,
  });
  pendingRestoreByKey.set(key, prev);
  return prev;
}

function buildMarkContextBody(
  params: CoordinatorEnterParams,
  resolved: NonNullable<ReturnType<typeof resolveSnapshotContext>>
): MarkContextReadRequest {
  const body: MarkContextReadRequest = {
    contextType: resolved.snapshotType,
    contextId: resolved.contextId,
  };
  if (resolved.snapshotType === 'GAME' && params.game) {
    body.gameChatTypes = getGameChatTypesForUnreadAndMarkRead(
      params.game,
      params.participant,
      params.parentParticipant,
      params.isParentGameAdminOrOwner
    );
  }
  return body;
}

export async function refreshContext(key: ContextKey): Promise<void> {
  const parsed = parseContextKey(key);
  if (!parsed) return;
  try {
    const unreadCount = await chatApi.getUnreadCountForContext(parsed.contextType, parsed.contextId);
    useUnreadStore.getState().applySocketDelta({
      contextType: parsed.contextType,
      contextId: parsed.contextId,
      unreadCount,
    });
  } catch {
    await useUnreadStore.getState().refreshAll();
  }
}

export function onMarkReadBatchFlushSuccess(key: ContextKey): void {
  confirmMarkRead(key);
  pendingRestoreByKey.delete(key);
  const parsed = parseContextKey(key);
  if (!parsed) return;
  useUnreadStore.getState().applySocketDelta({
    contextType: parsed.contextType,
    contextId: parsed.contextId,
    unreadCount: 0,
  });
  void refreshContext(key);
}

export function onMarkReadBatchFlushFailure(key: ContextKey): void {
  const prev = pendingRestoreByKey.get(key);
  if (prev != null && prev > 0) {
    useUnreadStore.getState().restoreContext(key, prev);
  }
  pendingRestoreByKey.delete(key);
  void refreshContext(key);
}

async function flushEnterContextMarkReadNetwork(
  params: CoordinatorEnterParams,
  resolved: NonNullable<ReturnType<typeof resolveSnapshotContext>>,
  key: ContextKey
): Promise<void> {
  const body = buildMarkContextBody(params, resolved);
  const markPayload =
    resolved.snapshotType === 'GAME'
      ? { target: 'context' as const, chatTypes: body.gameChatTypes }
      : resolved.snapshotType === 'GROUP'
        ? { target: 'group_channel' as const }
        : { target: 'context' as const };

  if (shouldQueueChatMutation()) {
    void OfflineIntent.enqueue({
      kind: 'mark_read_batch',
      contextType: resolved.snapshotType,
      contextId: resolved.contextId,
      payload: markPayload,
    }).finally(() => {
      const inflight = new Set(useUnreadStore.getState().markInFlight);
      inflight.delete(key);
      useUnreadStore.setState({ markInFlight: inflight });
    });
    return;
  }

  try {
    await chatApi.markContextRead(body);
    confirmMarkRead(key);
    pendingRestoreByKey.delete(key);
    useUnreadStore.getState().applySocketDelta({
      contextType: resolved.snapshotType,
      contextId: resolved.contextId,
      unreadCount: 0,
    });
  } catch (err) {
    console.error('[unreadCoordinator] markContextRead failed', err);
    const prev = pendingRestoreByKey.get(key) ?? 0;
    useUnreadStore.getState().restoreContext(key, prev);
    pendingRestoreByKey.delete(key);
    void refreshContext(key);
  } finally {
    const inflight = new Set(useUnreadStore.getState().markInFlight);
    inflight.delete(key);
    useUnreadStore.setState({ markInFlight: inflight });
  }
}

function scheduleMarkReadNetwork(
  params: CoordinatorEnterParams,
  resolved: NonNullable<ReturnType<typeof resolveSnapshotContext>>,
  key: ContextKey
): void {
  if (shouldSkipMarkReadNetwork(key)) return;
  const existing = activityNetworkTimers.get(key);
  if (existing) clearTimeout(existing);
  activityNetworkTimers.set(
    key,
    setTimeout(() => {
      activityNetworkTimers.delete(key);
      scheduleChatOpenIdle(() => {
        void flushEnterContextMarkReadNetwork(params, resolved, key);
      });
    }, ACTIVITY_MARK_DEBOUNCE_MS)
  );
}

/** Mark-read on send / activity: debounced server sync; optimistic clear when badge > 0. */
export function markContextReadOnUserActivity(params: CoordinatorEnterParams): void {
  const resolved = resolveSnapshotContext(params);
  if (!resolved) return;
  const { key } = resolved;
  if (shouldSkipMarkReadNetwork(key)) return;
  const state = useUnreadStore.getState();
  if ((state.byContext[key] ?? 0) > 0) {
    optimisticClear(key);
  } else {
    ensureMarkInFlight(key);
  }
  scheduleMarkReadNetwork(params, resolved, key);
}

export async function enterContextAndMarkRead(params: CoordinatorEnterParams): Promise<void> {
  const resolved = resolveSnapshotContext(params);
  if (!resolved) return;
  const { key } = resolved;

  const state = useUnreadStore.getState();
  if (shouldSkipEnterOptimistic(key, state)) {
    scheduleMarkReadNetwork(params, resolved, key);
    return;
  }

  setViewingBeforeMark(params, resolved);
  if ((state.byContext[key] ?? 0) > 0) {
    optimisticClear(key);
  } else {
    ensureMarkInFlight(key);
  }
  scheduleMarkReadNetwork(params, resolved, key);
}
