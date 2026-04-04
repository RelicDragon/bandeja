let staleCursorDispatches = 0;
let pullFailures = 0;

export const CHAT_SYNC_METRIC_EVENT = 'bandeja-chat-sync-metric';

export type ChatSyncMetricEventDetail =
  | { type: 'stale_cursor' }
  | { type: 'pull_failure' }
  | { type: 'thread_dexie_paint_ms'; ms: number }
  | { type: 'foreground_sync_ms'; ms: number };

function emitMetric(detail: ChatSyncMetricEventDetail): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CHAT_SYNC_METRIC_EVENT, { detail }));
  }
}

export function recordChatSyncStaleDispatch(): void {
  staleCursorDispatches += 1;
  emitMetric({ type: 'stale_cursor' });
  if (import.meta.env.DEV) {
    console.debug('[chatSyncMetrics] staleCursorDispatches', staleCursorDispatches);
  }
}

export function recordChatSyncPullFailure(): void {
  pullFailures += 1;
  emitMetric({ type: 'pull_failure' });
  if (import.meta.env.DEV) {
    console.debug('[chatSyncMetrics] pullFailures', pullFailures);
  }
}

export function getChatSyncMetricsSnapshot(): { staleCursorDispatches: number; pullFailures: number } {
  return { staleCursorDispatches, pullFailures };
}

export function resetChatSyncMetrics(): void {
  staleCursorDispatches = 0;
  pullFailures = 0;
}

export function recordChatSyncThreadDexiePaintMs(ms: number): void {
  if (!Number.isFinite(ms) || ms < 0) return;
  emitMetric({ type: 'thread_dexie_paint_ms', ms });
  if (import.meta.env.DEV) {
    console.debug('[chatSyncMetrics] thread_dexie_paint_ms', ms);
  }
}

export function recordChatSyncForegroundSyncMs(ms: number): void {
  if (!Number.isFinite(ms) || ms < 0) return;
  emitMetric({ type: 'foreground_sync_ms', ms });
  if (import.meta.env.DEV) {
    console.debug('[chatSyncMetrics] foreground_sync_ms', ms);
  }
}
