import { CHAT_SYNC_METRIC_EVENT } from '@/services/chat/chatSyncMetrics';

const STORAGE_KEY = 'bandeja_chat_sync_metrics_v1';

export type SessionChatSyncMetricCounts = {
  stale_cursor: number;
  pull_failure: number;
  last_thread_dexie_paint_ms: number | null;
  thread_dexie_paint_n: number;
  last_foreground_sync_ms: number | null;
  foreground_sync_n: number;
};

function readCounts(): SessionChatSyncMetricCounts {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultCounts();
    const p = JSON.parse(raw) as Partial<SessionChatSyncMetricCounts>;
    return {
      stale_cursor: typeof p.stale_cursor === 'number' ? p.stale_cursor : 0,
      pull_failure: typeof p.pull_failure === 'number' ? p.pull_failure : 0,
      last_thread_dexie_paint_ms:
        typeof p.last_thread_dexie_paint_ms === 'number' ? p.last_thread_dexie_paint_ms : null,
      thread_dexie_paint_n: typeof p.thread_dexie_paint_n === 'number' ? p.thread_dexie_paint_n : 0,
      last_foreground_sync_ms:
        typeof p.last_foreground_sync_ms === 'number' ? p.last_foreground_sync_ms : null,
      foreground_sync_n: typeof p.foreground_sync_n === 'number' ? p.foreground_sync_n : 0,
    };
  } catch {
    return defaultCounts();
  }
}

function defaultCounts(): SessionChatSyncMetricCounts {
  return {
    stale_cursor: 0,
    pull_failure: 0,
    last_thread_dexie_paint_ms: null,
    thread_dexie_paint_n: 0,
    last_foreground_sync_ms: null,
    foreground_sync_n: 0,
  };
}

function writeCounts(c: SessionChatSyncMetricCounts): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(c));
  } catch {
    /* quota / private mode */
  }
}

export function getSessionChatSyncMetricCounts(): SessionChatSyncMetricCounts {
  return readCounts();
}

let installed = false;

export function initChatSyncMetricsSession(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const log =
    import.meta.env.VITE_CHAT_SYNC_METRICS_LOG === '1' ||
    import.meta.env.VITE_CHAT_SYNC_METRICS_LOG === 'true';

  window.addEventListener(CHAT_SYNC_METRIC_EVENT, ((ev: Event) => {
    const d = (ev as CustomEvent<{ type?: string; ms?: number }>).detail;
    const type = d?.type;
    const c = readCounts();
    if (type === 'stale_cursor') c.stale_cursor += 1;
    else if (type === 'pull_failure') c.pull_failure += 1;
    else if (type === 'thread_dexie_paint_ms' && typeof d.ms === 'number') {
      c.last_thread_dexie_paint_ms = d.ms;
      c.thread_dexie_paint_n += 1;
    } else if (type === 'foreground_sync_ms' && typeof d.ms === 'number') {
      c.last_foreground_sync_ms = d.ms;
      c.foreground_sync_n += 1;
    } else return;
    writeCounts(c);
    if (log && import.meta.env.PROD) {
      console.info('[chatSyncMetrics]', type, c);
    }
  }) as EventListener);
}
