import { chatApi, type ChatContextType } from '@/api/chat';
import type { ChatType } from '@/types';
import { getGameChatTypesForUnreadAndMarkRead } from '@/utils/gameChatTypesForUnread';
import { useGameDetailsChromeStore } from '@/components/GameDetails/gameDetailsChromeStore';
import { useUnreadStore, type EnterContextParams } from '@/store/unreadStore';
import {
  clearMarkInFlight,
  getPendingClientOpId,
  reduceUnreadProjection,
  shouldSkipEnterOptimistic,
  shouldSkipMarkReadNetwork,
} from '@/services/chat/unreadProjection';
import { runUnreadProjectionEffects } from '@/services/chat/unreadProjectionEffects';
import {
  contextKey,
  bugChannelIdFromMeta,
  parseContextKey,
  type ContextKey,
  type MarkContextReadRequest,
  type MarkContextReadResponse,
  type SnapshotContextType,
} from '@/services/chat/unreadSnapshot';
import { shouldSuppressUnreadForOpenContext } from '@/services/chat/unreadViewingGuard';
import { shouldQueueChatMutation } from '@/services/chat/chatMutationNetwork';
import { OfflineIntent } from '@/services/chat/offlineIntent';
import { newClientMutationId } from '@/services/chat/chatMutationQueueStorage';
import { scheduleChatOpenIdle } from '@/utils/chatOpenIdle';

export type CoordinatorEnterParams = EnterContextParams & {
  rawContextType?: ChatContextType;
  gameChatType?: ChatType;
  groupChannelId?: string;
};

const projectionConfig = {
  shouldSuppressDisplay: shouldSuppressUnreadForOpenContext,
};

const activityNetworkTimers = new Map<ContextKey, ReturnType<typeof setTimeout>>();
const ACTIVITY_MARK_DEBOUNCE_MS = 280;

function dispatchMarkReadRequested(key: ContextKey, clientOpId: string, skipOptimistic?: boolean): void {
  const state = useUnreadStore.getState();
  const event = skipOptimistic
    ? ({ type: 'enterContext' as const, contextKey: key, clientOpId, skipOptimistic: true })
    : ({ type: 'markReadRequested' as const, contextKey: key, clientOpId });
  const { state: next, effects } = reduceUnreadProjection(state, event, projectionConfig);
  runUnreadProjectionEffects(effects);
  useUnreadStore.setState({ ...next, byContext: next.baseByContext });
}

/** Cleared when socket reports unread > 0 for this context (see unreadStore.applySocketDelta). */
export function invalidateMarkReadConfirmed(_key: ContextKey): void {
  // Projection clears markReadConfirmedKeys on authorityEnvelope with unreadCount > 0
}

/** Matching clientOpId on authority envelope clears pending optimistic clear. */
export function onAuthorityEnvelopeAck(_key: ContextKey, _clientOpId?: string): void {
  // Handled in projection reduceAuthorityEnvelope
}

export function resetCoordinator(): void {
  for (const timer of activityNetworkTimers.values()) {
    clearTimeout(timer);
  }
  activityNetworkTimers.clear();
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
    const meta = useUnreadStore.getState().groupChannelMeta;
    const channelId = params.groupChannelId ?? bugChannelIdFromMeta(params.contextId, meta);
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

function isViewingContextKey(key: ContextKey): boolean {
  const parsed = parseContextKey(key);
  if (!parsed) return false;
  return shouldSuppressUnreadForOpenContext(parsed.contextType, parsed.contextId);
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

function getOrCreateClientOpId(key: ContextKey): string {
  const existing = getPendingClientOpId(useUnreadStore.getState(), key);
  if (existing) return existing;
  const clientOpId = newClientMutationId();
  dispatchMarkReadRequested(key, clientOpId, true);
  return clientOpId;
}

function buildMarkContextBody(
  params: CoordinatorEnterParams,
  resolved: NonNullable<ReturnType<typeof resolveSnapshotContext>>,
  key: ContextKey
): MarkContextReadRequest {
  const body: MarkContextReadRequest = {
    contextType: resolved.snapshotType,
    contextId: resolved.contextId,
    clientOpId: getOrCreateClientOpId(key),
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

export async function refreshContext(_key: ContextKey): Promise<void> {
  await useUnreadStore.getState().refreshAll();
}

function shouldSkipRedundantRefreshAfterMarkReadSuccess(key: ContextKey): boolean {
  return (useUnreadStore.getState().displayedByContext[key] ?? 0) === 0;
}

function isMarkReadAuthorityAck(ack: MarkContextReadResponse | undefined): ack is MarkContextReadResponse {
  return ack != null && ack.clock != null && typeof ack.contextKey === 'string';
}

function tryApplyMarkReadAuthorityAck(key: ContextKey, ack: MarkContextReadResponse): boolean {
  if (!isMarkReadAuthorityAck(ack)) return false;

  const pendingOpId = getPendingClientOpId(useUnreadStore.getState(), key);
  if (pendingOpId && ack.clientOpId && pendingOpId !== ack.clientOpId) {
    return false;
  }

  const parsed = parseContextKey(key);
  if (!parsed) return false;

  useUnreadStore.getState().applySocketDelta({
    contextType: parsed.contextType,
    contextId: parsed.contextId,
    unreadCount: ack.unreadCount,
    contextKey: ack.contextKey,
    clock: ack.clock,
    clientOpId: ack.clientOpId,
  });
  return true;
}

export function onMarkReadBatchFlushSuccess(
  key: ContextKey,
  ack?: MarkContextReadResponse
): void {
  if (!ack || !tryApplyMarkReadAuthorityAck(key, ack)) {
    return;
  }
  const parsed = parseContextKey(key);
  if (!parsed) return;
  const skipRefresh = shouldSkipRedundantRefreshAfterMarkReadSuccess(key);
  if (!skipRefresh) {
    void refreshContext(key);
  }
}

export function onMarkReadBatchFlushFailure(key: ContextKey): void {
  const state = useUnreadStore.getState();
  const { state: next, effects } = reduceUnreadProjection(
    state,
    { type: 'markReadFailed', contextKey: key },
    projectionConfig
  );
  runUnreadProjectionEffects(effects);
  useUnreadStore.setState({ ...next, byContext: next.baseByContext });
  void refreshContext(key);
}

async function flushEnterContextMarkReadNetwork(
  params: CoordinatorEnterParams,
  resolved: NonNullable<ReturnType<typeof resolveSnapshotContext>>,
  key: ContextKey
): Promise<void> {
  const body = buildMarkContextBody(params, resolved, key);
  const clientOpId = body.clientOpId ?? getOrCreateClientOpId(key);
  const markPayload =
    resolved.snapshotType === 'GAME'
      ? { target: 'context' as const, chatTypes: body.gameChatTypes, clientOpId }
      : resolved.snapshotType === 'GROUP'
        ? { target: 'group_channel' as const, clientOpId }
        : { target: 'context' as const, clientOpId };

  if (shouldQueueChatMutation()) {
    void OfflineIntent.enqueue({
      kind: 'mark_read_batch',
      contextType: resolved.snapshotType,
      contextId: resolved.contextId,
      payload: markPayload,
    }).finally(() => {
      const cleared = clearMarkInFlight(useUnreadStore.getState(), key);
      useUnreadStore.setState({ ...cleared, byContext: cleared.baseByContext });
    });
    return;
  }

  try {
    const response = await chatApi.markContextRead(body);
    const ack = response.data;
    tryApplyMarkReadAuthorityAck(key, ack);
  } catch (err) {
    console.error('[unreadCoordinator] markContextRead failed', err);
    onMarkReadBatchFlushFailure(key);
  } finally {
    const cleared = clearMarkInFlight(useUnreadStore.getState(), key);
    useUnreadStore.setState({ ...cleared, byContext: cleared.baseByContext });
  }
}

function scheduleMarkReadNetwork(
  params: CoordinatorEnterParams,
  resolved: NonNullable<ReturnType<typeof resolveSnapshotContext>>,
  key: ContextKey
): void {
  if (shouldSkipMarkReadNetwork(useUnreadStore.getState(), key)) return;
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

export function markContextReadOnUserActivity(params: CoordinatorEnterParams): void {
  const resolved = resolveSnapshotContext(params);
  if (!resolved) return;
  const { key } = resolved;
  if (shouldSkipMarkReadNetwork(useUnreadStore.getState(), key)) return;
  const state = useUnreadStore.getState();
  if ((state.displayedByContext[key] ?? 0) > 0) {
    dispatchMarkReadRequested(key, newClientMutationId());
  } else {
    getOrCreateClientOpId(key);
  }
  scheduleMarkReadNetwork(params, resolved, key);
}

export async function enterContextAndMarkRead(params: CoordinatorEnterParams): Promise<void> {
  const resolved = resolveSnapshotContext(params);
  if (!resolved) return;
  const { key } = resolved;

  const state = useUnreadStore.getState();
  if (shouldSkipEnterOptimistic(state, key) && isViewingContextKey(key)) {
    scheduleMarkReadNetwork(params, resolved, key);
    return;
  }

  setViewingBeforeMark(params, resolved);
  if ((state.displayedByContext[key] ?? 0) > 0) {
    dispatchMarkReadRequested(key, newClientMutationId());
  } else {
    getOrCreateClientOpId(key);
  }
  scheduleMarkReadNetwork(params, resolved, key);
}
