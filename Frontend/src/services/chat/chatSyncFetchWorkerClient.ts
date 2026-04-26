import type { ChatContextType } from '@/api/chat';
import { chatApi } from '@/api/chat';
import { resolveAbsoluteApiBaseUrlForFetch } from '@/api/apiBaseUrl';
import {
  AUTH_CODES_SKIP_REFRESH,
  consumeRefreshRunClearedCredentials,
  refreshAccessTokenSingleFlight,
} from '@/api/authRefresh';
import { handleApiUnauthorizedIfNeeded } from '@/api/handleApiUnauthorized';
import type { ApiResponse } from '@/types';
import { isCapacitor } from '@/utils/capacitor';
import { processDeletedUsers } from '@/utils/deletedUserHandler';

export type ChatSyncEventsPack = {
  events: Array<{ id: string; seq: number; eventType: string; payload: unknown; createdAt: string }>;
  hasMore: boolean;
  oldestRetainedSeq?: number | null;
  cursorStale?: boolean;
};

const SYNC_EVENTS_TIMEOUT_MS = 55_000;

function buildChatSyncEventsUrl(
  contextType: ChatContextType,
  contextId: string,
  afterSeq: number,
  limit: number
): string {
  const params = new URLSearchParams({
    contextType,
    contextId,
    afterSeq: String(afterSeq),
    limit: String(limit),
  });
  if (!isCapacitor()) {
    params.set('_t', String(Date.now()));
  }
  return `${resolveAbsoluteApiBaseUrlForFetch()}/chat/sync/events?${params.toString()}`;
}

function buildSyncFetchHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
  if (token) h.Authorization = `Bearer ${token}`;
  if (!isCapacitor()) {
    h['Cache-Control'] = 'no-cache, no-store, must-revalidate';
    h.Pragma = 'no-cache';
    h.Expires = '0';
  }
  return h;
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (v: { status: number; body: unknown }) => void; reject: (e: unknown) => void }>();

function rejectAllPending(reason: unknown): void {
  for (const [, p] of pending) {
    p.reject(reason);
  }
  pending.clear();
}

function createWorker(): Worker {
  return new Worker(new URL('./chatSyncFetch.worker.ts', import.meta.url), { type: 'module' });
}

function getWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  if (worker) return worker;
  try {
    const w = createWorker();
    w.onmessage = (ev: MessageEvent) => {
      const msg = ev.data as {
        type?: string;
        id?: number;
        kind?: string;
        status?: number;
        body?: unknown;
        code?: string;
      };
      if (msg?.type !== 'RESULT' || msg.id == null) return;
      const rec = pending.get(msg.id);
      if (!rec) return;
      pending.delete(msg.id);
      if (msg.kind === 'ok' && msg.status != null) {
        rec.resolve({ status: msg.status, body: msg.body });
        return;
      }
      rec.reject({ workerErr: true as const, code: msg.code, status: msg.status });
    };
    w.onerror = (e) => {
      rejectAllPending(e.error ?? e.message);
      worker = null;
    };
    worker = w;
    return w;
  } catch {
    return null;
  }
}

function throwAxiosLike(opts: { status?: number; code?: string; request?: boolean }): never {
  const err = new Error('chat sync fetch failed') as Error & {
    response?: { status: number; headers: Record<string, string> };
    code?: string;
    request?: boolean;
  };
  if (opts.status != null) err.response = { status: opts.status, headers: {} };
  if (opts.code) err.code = opts.code;
  if (opts.request) err.request = true;
  throw err;
}

function extractPackFromApiBody(body: unknown): ChatSyncEventsPack {
  const processed = processDeletedUsers(body) as ApiResponse<ChatSyncEventsPack>;
  if (!processed?.success || processed.data == null) {
    throwAxiosLike({ status: 502 });
  }
  return processed.data;
}

export async function fetchChatSyncEventsPackOffMainThread(
  contextType: ChatContextType,
  contextId: string,
  afterSeq: number,
  limit: number
): Promise<ChatSyncEventsPack> {
  if (typeof window === 'undefined') {
    return chatApi.getChatSyncEvents(contextType, contextId, afterSeq, limit);
  }

  const w = getWorker();
  if (!w) {
    return chatApi.getChatSyncEvents(contextType, contextId, afterSeq, limit);
  }

  const url = buildChatSyncEventsUrl(contextType, contextId, afterSeq, limit);

  async function workerFetchOnce(
    worker: Worker,
    headers: Record<string, string>
  ): Promise<{ status: number; body: unknown }> {
    const id = nextId++;
    return new Promise<{ status: number; body: unknown }>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      try {
        worker.postMessage({
          type: 'FETCH',
          id,
          url,
          headers,
          timeoutMs: SYNC_EVENTS_TIMEOUT_MS,
        });
      } catch (e) {
        pending.delete(id);
        reject(e);
      }
    });
  }

  const initialHeaders = buildSyncFetchHeaders();
  const hadBearerOnRequest =
    typeof initialHeaders.Authorization === 'string' && initialHeaders.Authorization.startsWith('Bearer ');

  let result: { status: number; body: unknown };
  try {
    result = await workerFetchOnce(w, initialHeaders);
  } catch (e: unknown) {
    if (e && typeof e === 'object' && (e as { workerErr?: boolean }).workerErr) {
      const we = e as { code?: string; status?: number };
      if (we.code === 'abort') throwAxiosLike({ code: 'ECONNABORTED' });
      if (we.code === 'network') throwAxiosLike({ request: true });
      if (we.code === 'bad_json') throwAxiosLike({ status: we.status ?? 502 });
    }
    worker = null;
    return chatApi.getChatSyncEvents(contextType, contextId, afterSeq, limit);
  }

  if (result.status >= 400) {
    if (result.status === 401) {
      const body401 = result.body as { code?: string } | undefined;
      const c401 = body401 && typeof body401 === 'object' ? body401.code : undefined;
      if (typeof c401 === 'string' && AUTH_CODES_SKIP_REFRESH.has(c401)) {
        handleApiUnauthorizedIfNeeded({ forceSessionClear: true });
        throwAxiosLike({ status: 401 });
      }
      const authLike =
        c401 === 'auth.accessExpired' ||
        c401 === 'auth.invalidToken' ||
        c401 === 'auth.refreshExpired' ||
        c401 === 'auth.refreshInvalid' ||
        (c401 === undefined && hadBearerOnRequest);
      if (!authLike) {
        handleApiUnauthorizedIfNeeded();
      } else {
        const newTok = await refreshAccessTokenSingleFlight();
        if (newTok) {
          try {
            result = await workerFetchOnce(w, buildSyncFetchHeaders());
          } catch {
            handleApiUnauthorizedIfNeeded({ forceSessionClear: true });
            throwAxiosLike({ status: 401 });
          }
          if (result.status === 401) {
            handleApiUnauthorizedIfNeeded();
          }
        } else if (consumeRefreshRunClearedCredentials()) {
          handleApiUnauthorizedIfNeeded({ forceSessionClear: true });
        } else {
          handleApiUnauthorizedIfNeeded();
        }
      }
    }
    if (result.status >= 400) {
      throwAxiosLike({ status: result.status });
    }
  }

  return extractPackFromApiBody(result.body);
}
