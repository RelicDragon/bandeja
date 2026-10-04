import { AGENT_TERMINAL_EVENT_TYPES, type AgentStreamEvent } from '@shared/agentContract';
import { isTerminalPhase, type AgentRunLiveState } from './agentRunReducer';
import { useAgentRunStore } from './agentRunStore';
import { parseSseChunk, type SseFrame } from './sseParser';

/** Server sends a keep-alive comment at least every 15s; three missed ones = dead connection. */
const IDLE_TIMEOUT_MS = 45_000;
const RETRY_MIN_MS = 1_000;
const RETRY_MAX_MS = 15_000;

type ConnectOutcome = 'terminal' | 'retry' | 'retry-auth' | 'stop';

export function buildAgentEventsUrl(base: string, runId: string, afterEventId: string | null): string {
  const path = `${base.replace(/\/$/, '')}/agent/runs/${encodeURIComponent(runId)}/events`;
  return afterEventId ? `${path}?after=${encodeURIComponent(afterEventId)}` : path;
}

export function parseAgentStreamFrame(frame: SseFrame): AgentStreamEvent | null {
  if (!frame.data) return null;
  try {
    const parsed = JSON.parse(frame.data) as Partial<AgentStreamEvent> & Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.type === 'string') return parsed as AgentStreamEvent;
    if (frame.event) return { ...parsed, type: frame.event } as AgentStreamEvent;
    return null;
  } catch {
    return null;
  }
}

/**
 * Which run the chat view keeps attached to.
 *
 * - The chat's live run (QUEUED / RUNNING per `GET /agent/chats/:id`).
 * - Otherwise the run this view last watched, if its stored state never got a terminal event:
 *   the server ended it (failed / interrupted / cancelled elsewhere) and the refetch already
 *   says `activeRun: null`. Re-attaching resumes after the last event id; the server ends a
 *   finished run's stream with its terminal event (rebuilt from the DB if the log expired), so
 *   the view can show the failure card. Once terminal, attaching again is a no-op.
 * - Never a run whose attach was refused (403/404): that would loop on every mount.
 */
export function agentRunIdToAttach(opts: {
  liveServerRunId: string | null;
  lastRunId: string | null;
  storedRun: AgentRunLiveState | null;
}): string | null {
  if (opts.liveServerRunId) return opts.liveServerRunId;
  const { lastRunId, storedRun } = opts;
  if (!lastRunId || !storedRun || storedRun.runId !== lastRunId || storedRun.connectionFailed) return null;
  return lastRunId;
}

export interface AgentRunAttachDeps {
  fetch: typeof fetch;
  apiBaseUrl: () => string;
  headers: (lastEventId: string | null) => Record<string, string>;
  /** Native builds are cross-origin: no cookies. */
  native: boolean;
  refreshToken: () => Promise<string | null>;
  /** Called after each event is applied to the run store (cache patches). */
  /** Every parsed event, replays included (`eventId` lets listeners dedupe). */
  onEvent?: (event: AgentStreamEvent, eventId: string | null) => void;
  /** Terminal event received. The draft is dropped (`settled`) once this resolves. */
  onTerminal?: () => Promise<void> | void;
  /** Server refused the stream (403/404) or auth could not be refreshed. */
  onRefused?: () => void;
}

export interface AgentRunAttachment {
  detach: () => void;
  /** Drop the current connection and reconnect now, resuming from the last event id. */
  reconnect: () => void;
  msSinceLastByte: () => number;
  /** Resolves when the attach loop exits (terminal, refused or detached). */
  done: Promise<void>;
}

/**
 * Attach to a run's SSE stream. Live state goes to
 * `useAgentRunStore`, which outlives the chat view.
 *
 * - No stored state for the run (first open, page reload, evicted): replays from the start.
 * - Stored state: resumes after its last event id. The reducer drops ids at or before it, so
 *   overlapping replays never duplicate text or tool chips.
 *
 * Reconnects with backoff on network loss / idle timeout. `detach` only closes the
 * connection; the run keeps going server-side and the stored state stays for the next attach.
 */
export function attachAgentRun(runId: string, chatId: string, deps: AgentRunAttachDeps): AgentRunAttachment {
  const store = useAgentRunStore.getState();
  const initial = store.ensureRun(runId, chatId);
  const getRun = () => useAgentRunStore.getState().runs[runId] ?? null;
  const dispatch = (action: Parameters<typeof store.dispatch>[1]) =>
    useAgentRunStore.getState().dispatch(runId, action);

  let disposed = false;
  let attemptController: AbortController | null = null;
  let wakeSleep: (() => void) | null = null;
  let skipBackoff = false;
  let lastByteAt = Date.now();

  const reconnect = () => {
    skipBackoff = true;
    attemptController?.abort();
    wakeSleep?.();
  };

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        wakeSleep = null;
        resolve();
      };
      const timer = setTimeout(done, ms);
      wakeSleep = done;
    });

  const refuse = () => {
    dispatch({ type: 'connectionFailed', code: 'INTERNAL', message: null });
    deps.onRefused?.();
  };

  const connectOnce = async (): Promise<ConnectOutcome> => {
    const controller = new AbortController();
    attemptController = controller;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    const resetIdle = () => {
      lastByteAt = Date.now();
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => controller.abort(), IDLE_TIMEOUT_MS);
    };
    try {
      resetIdle();
      const lastEventId = getRun()?.lastEventId ?? null;
      const response = await deps.fetch(buildAgentEventsUrl(deps.apiBaseUrl(), runId, lastEventId), {
        method: 'GET',
        headers: deps.headers(lastEventId),
        signal: controller.signal,
        cache: 'no-store',
        credentials: deps.native ? 'omit' : 'include',
      });
      if (response.status === 401) return 'retry-auth';
      if (response.status === 403 || response.status === 404) return 'stop';
      if (!response.ok || !response.body) return 'retry';

      dispatch({ type: 'connected' });
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let rest = '';
      while (!disposed) {
        const { done, value } = await reader.read();
        if (done) break;
        resetIdle();
        const parsed = parseSseChunk(rest, decoder.decode(value, { stream: true }));
        rest = parsed.rest;
        for (const frame of parsed.frames) {
          if (disposed) break;
          const event = parseAgentStreamFrame(frame);
          if (!event) continue;
          dispatch({ type: 'event', event, eventId: frame.id });
          deps.onEvent?.(event, frame.id ?? null);
          if (AGENT_TERMINAL_EVENT_TYPES.includes(event.type)) {
            controller.abort();
            return 'terminal';
          }
        }
      }
      return 'retry';
    } catch {
      return 'retry';
    } finally {
      if (idleTimer) clearTimeout(idleTimer);
      if (attemptController === controller) attemptController = null;
    }
  };

  const loop = async () => {
    let retryDelay = RETRY_MIN_MS;
    let refreshedAfter401 = false;
    while (!disposed) {
      const run = getRun();
      if (!run || isTerminalPhase(run.phase)) return;
      const outcome = await connectOnce();
      if (disposed) return;
      if (outcome === 'terminal') {
        try {
          await deps.onTerminal?.();
        } finally {
          dispatch({ type: 'settled' });
        }
        return;
      }
      if (outcome === 'stop') {
        refuse();
        return;
      }
      if (outcome === 'retry-auth') {
        if (refreshedAfter401) {
          refuse();
          return;
        }
        refreshedAfter401 = true;
        const token = await deps.refreshToken();
        if (disposed) return;
        if (!token) {
          refuse();
          return;
        }
        continue;
      }
      // A plain retry means the 401 (if any) was solved: allow one more refresh later.
      refreshedAfter401 = false;
      if (skipBackoff) {
        skipBackoff = false;
        retryDelay = RETRY_MIN_MS;
        continue;
      }
      await sleep(retryDelay);
      retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
    }
  };

  const done = isTerminalPhase(initial.phase) ? Promise.resolve() : loop().catch(() => undefined);

  return {
    detach: () => {
      disposed = true;
      attemptController?.abort();
      wakeSleep?.();
    },
    reconnect,
    msSinceLastByte: () => Date.now() - lastByteAt,
    done,
  };
}
