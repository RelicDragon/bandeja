import {
  agentEntityKey,
  type AgentEntityRef,
  type AgentErrorCode,
  type AgentPendingActionDto,
  type AgentStreamEvent,
  type AgentUsage,
  type AgentWebView,
} from '@shared/agentContract';

/**
 * Live (not yet persisted) state of one agent run, built from its SSE events.
 *
 * Persisted messages come from `GET /agent/chats/:id` (React Query). This state only holds
 * what the server has streamed but not yet saved: `message.saved` clears the draft segments
 * because that content is now in the chat detail. Tool step outcomes are kept across saves
 * so a persisted `tool_call` block can still show the live result chip.
 */

export type AgentRunPhase =
  /** No event seen yet (fresh attach or full replay in flight). */
  | 'connecting'
  /** `run.queued`: waiting for a worker slot. */
  | 'queued'
  | 'streaming'
  | 'completed'
  | 'awaiting_confirmation'
  | 'failed'
  | 'cancelled';

export interface AgentToolStep {
  callId: string;
  name: string;
  label: string;
  status: 'running' | 'ok' | 'error';
  summary: string | null;
  entities: AgentEntityRef[];
  /** Web search / fetch view (Phase 13), from `tool.finished`. */
  web?: AgentWebView;
}

/** `memory.saved` payload (Phase 11): the chip under that tool call offers Undo. */
export type AgentMemorySaved = Extract<AgentStreamEvent, { type: 'memory.saved' }>['memory'];

export type AgentDraftSegment =
  | { kind: 'text'; text: string }
  | { kind: 'tool'; callId: string }
  | { kind: 'action'; actionId: string };

export interface AgentRunLiveState {
  runId: string;
  chatId: string | null;
  phase: AgentRunPhase;
  /** 1-based queue position from the latest `run.queued`; null once started. */
  queuePosition: number | null;
  /** Unsaved content in arrival order. */
  segments: AgentDraftSegment[];
  tools: Record<string, AgentToolStep>;
  actions: Record<string, AgentPendingActionDto>;
  /** `memory.saved` by tool call id; kept across saves like `tools` (the chip is live only). */
  memorySaves: Record<string, AgentMemorySaved>;
  /** Every entity seen during the run (for cache invalidation on the terminal event). */
  touchedEntities: AgentEntityRef[];
  lastEventId: string | null;
  error: { code: AgentErrorCode; message: string | null } | null;
  usage: AgentUsage | null;
  /**
   * `failed` came from the client side (401 after refresh, 403/404 on attach), not from a
   * `run.failed` event. Such a state is discarded on the next attach so the view can replay.
   */
  connectionFailed: boolean;
}

export type AgentRunAction =
  | { type: 'event'; event: AgentStreamEvent; eventId: string | null }
  /** HTTP stream opened. Phase is left alone: the first event says queued vs started. */
  | { type: 'connected' }
  | { type: 'connectionFailed'; code: AgentErrorCode; message: string | null }
  /** Terminal run whose chat detail has been refetched: drop the draft so nothing renders twice. */
  | { type: 'settled' }
  /**
   * The user confirmed / cancelled one of the run's actions. Once none is PENDING the paused
   * run is over server-side, so AWAITING_CONFIRMATION must not linger locally.
   */
  | { type: 'actionHandled'; action: AgentPendingActionDto };

export const TERMINAL_PHASES: readonly AgentRunPhase[] = [
  'completed',
  'awaiting_confirmation',
  'failed',
  'cancelled',
];

export function isTerminalPhase(phase: AgentRunPhase): boolean {
  return TERMINAL_PHASES.includes(phase);
}

export function createRunState(runId: string, chatId: string | null): AgentRunLiveState {
  return {
    runId,
    chatId,
    phase: 'connecting',
    queuePosition: null,
    segments: [],
    tools: {},
    actions: {},
    memorySaves: {},
    touchedEntities: [],
    lastEventId: null,
    error: null,
    usage: null,
    connectionFailed: false,
  };
}

function appendText(segments: AgentDraftSegment[], text: string): AgentDraftSegment[] {
  if (!text) return segments;
  const last = segments[segments.length - 1];
  if (last?.kind === 'text') {
    return [...segments.slice(0, -1), { kind: 'text', text: last.text + text }];
  }
  return [...segments, { kind: 'text', text }];
}

function addEntities(existing: AgentEntityRef[], next: AgentEntityRef[] | undefined): AgentEntityRef[] {
  if (!next || next.length === 0) return existing;
  const seen = new Set(existing.map(agentEntityKey));
  const added = next.filter((e) => !seen.has(agentEntityKey(e)));
  return added.length > 0 ? [...existing, ...added] : existing;
}

function applyEvent(state: AgentRunLiveState, event: AgentStreamEvent): AgentRunLiveState {
  switch (event.type) {
    case 'run.queued':
      // Position updates only matter before the run starts.
      if (state.phase !== 'connecting' && state.phase !== 'queued') return state;
      return {
        ...state,
        chatId: event.chatId ?? state.chatId,
        phase: 'queued',
        queuePosition: Number.isFinite(event.position) ? event.position : state.queuePosition,
      };
    case 'run.started':
      return { ...state, chatId: event.chatId ?? state.chatId, phase: 'streaming', queuePosition: null };
    case 'text.delta':
      return { ...state, phase: 'streaming', queuePosition: null, segments: appendText(state.segments, event.text) };
    case 'tool.started': {
      const known = Boolean(state.tools[event.callId]);
      return {
        ...state,
        phase: 'streaming',
        queuePosition: null,
        tools: {
          ...state.tools,
          [event.callId]: {
            callId: event.callId,
            name: event.name,
            label: event.label,
            status: 'running',
            summary: null,
            entities: [],
          },
        },
        segments: known ? state.segments : [...state.segments, { kind: 'tool', callId: event.callId }],
      };
    }
    case 'tool.finished': {
      const prev = state.tools[event.callId];
      const step: AgentToolStep = {
        callId: event.callId,
        name: prev?.name ?? '',
        label: prev?.label ?? event.summary,
        status: event.ok ? 'ok' : 'error',
        summary: event.summary,
        entities: event.entities ?? [],
        ...(event.web ? { web: event.web } : {}),
      };
      return {
        ...state,
        tools: { ...state.tools, [event.callId]: step },
        segments: prev ? state.segments : [...state.segments, { kind: 'tool', callId: event.callId }],
        touchedEntities: addEntities(state.touchedEntities, event.entities),
      };
    }
    case 'action.pending': {
      const known = Boolean(state.actions[event.action.id]);
      return {
        ...state,
        actions: { ...state.actions, [event.action.id]: event.action },
        segments: known
          ? state.segments
          : [...state.segments, { kind: 'action', actionId: event.action.id }],
      };
    }
    case 'memory.saved':
      return { ...state, memorySaves: { ...state.memorySaves, [event.callId]: event.memory } };
    case 'message.saved': {
      const touched = event.message.blocks.flatMap((b) =>
        b.type === 'tool_result' ? (b.entities ?? []) : [],
      );
      return {
        ...state,
        segments: [],
        touchedEntities: addEntities(state.touchedEntities, touched),
      };
    }
    case 'run.completed':
      return {
        ...state,
        phase: event.status === 'AWAITING_CONFIRMATION' ? 'awaiting_confirmation' : 'completed',
        queuePosition: null,
        usage: event.usage,
      };
    case 'run.failed':
      return { ...state, phase: 'failed', queuePosition: null, error: { code: event.code, message: event.message } };
    case 'run.cancelled':
      return { ...state, phase: 'cancelled', queuePosition: null };
    default:
      return state;
  }
}

export function agentRunReducer(state: AgentRunLiveState, action: AgentRunAction): AgentRunLiveState {
  switch (action.type) {
    case 'event': {
      // Replays after a reconnect may resend events we already applied; ids are monotonic.
      if (action.eventId != null && state.lastEventId != null && isEventIdAtOrBefore(action.eventId, state.lastEventId)) {
        return state;
      }
      if (isTerminalPhase(state.phase)) return state;
      const next = applyEvent(state, action.event);
      return { ...next, lastEventId: action.eventId ?? next.lastEventId };
    }
    case 'connected':
      return state;
    case 'connectionFailed':
      if (isTerminalPhase(state.phase)) return state;
      return {
        ...state,
        phase: 'failed',
        queuePosition: null,
        connectionFailed: true,
        error: { code: action.code, message: action.message },
      };
    case 'settled':
      return isTerminalPhase(state.phase) ? { ...state, segments: [] } : state;
    case 'actionHandled': {
      const actions = state.actions[action.action.id]
        ? { ...state.actions, [action.action.id]: action.action }
        : state.actions;
      const stillPending = Object.values(actions).some((a) => a.status === 'PENDING');
      if (state.phase !== 'awaiting_confirmation' || stillPending) {
        return actions === state.actions ? state : { ...state, actions };
      }
      return { ...state, actions, phase: 'completed', segments: [] };
    }
    default:
      return state;
  }
}

/**
 * Event ids are monotonic. Redis stream ids look like `1727712345678-3`; plain integers also
 * work. Compare numerically part by part; fall back to string equality for anything else.
 */
export function isEventIdAtOrBefore(candidate: string, last: string): boolean {
  const parse = (id: string): number[] | null => {
    const parts = id.split('-');
    if (parts.length === 0 || parts.length > 2) return null;
    const nums = parts.map((p) => (/^\d+$/.test(p) ? Number(p) : NaN));
    return nums.some((n) => Number.isNaN(n)) ? null : nums;
  };
  const a = parse(candidate);
  const b = parse(last);
  if (!a || !b) return candidate === last;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y;
  }
  return true;
}
