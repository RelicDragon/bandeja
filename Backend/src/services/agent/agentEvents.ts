/**
 * Per-run event log for the agent SSE stream (`GET /api/agent/runs/:runId/events`).
 *
 * Ids are integers, monotonic per run; clients resend the last one (`Last-Event-ID` /
 * `?after=`) and get the rest. A log lives from enqueue for the whole run and
 * `AGENT_EVENT_RETENTION_MS` (1h) after its terminal event, so a client that left the chat
 * can come back and replay everything, `text.delta`s included, from id 0.
 *
 * Two stores behind `AgentEventStore`:
 *   - `RedisAgentEventStore` when `REDIS_URL` is set: shared by every process (the run may
 *     execute in `worker.ts` while `server.ts` serves the stream). Per run: an INCR counter
 *     for ids, a sorted set (score = id) for events, a terminal flag, and a pub/sub channel
 *     (`pp:agent:run-events:<runId>`) a process subscribes to while it has stream listeners
 *     for that run. An append is one Lua script (`AGENT_APPEND_SCRIPT`): one round trip.
 *   - `InMemoryAgentEventStore` otherwise: only valid when the process that executes runs
 *     also serves HTTP, so without Redis the agent queue runs in the API process only
 *     (`AgentRunQueueService`).
 *
 * `getAgentEventStore` wraps either in `CoalescingAgentEventStore`: consecutive `text.delta`s
 * of a run are merged every `AGENT_TEXT_DELTA_COALESCE_MS` (50ms) into one ordinary delta.
 *
 * When a log is gone (expired, Redis down, in-memory restart) the stream is rebuilt from
 * the database with ids from `AGENT_SYNTHETIC_EVENT_ID_BASE`, above any live id. A log
 * re-opened for a run that already existed (`resumed`) starts at `Date.now() * 1000`, so its
 * ids stay above whatever an earlier in-memory log of the same run handed out.
 */
import type { AgentStreamEvent } from '@bandeja/shared/agentContract';
import { getRedisClient, getRedisSubscriber, isRedisConfigured } from '../redis/redisClient';
import { RedisScript } from '../redis/redisScript';

export type AgentStoredEvent = { id: number; event: AgentStreamEvent };
export type AgentEventListener = (stored: AgentStoredEvent) => void;

export const AGENT_EVENT_RETENTION_MS = 60 * 60 * 1000;
/** Safety TTL for logs of runs that never reach a terminal event. */
export const AGENT_EVENT_OPEN_TTL_MS = 24 * 60 * 60 * 1000;
export const AGENT_MAX_EVENTS_PER_RUN = 20_000;
/** Synthetic replays sort after any live id (resumed logs start near 1.8e15). */
export const AGENT_SYNTHETIC_EVENT_ID_BASE = 8_000_000_000_000_000;

/** `/api/agent/runs/:runId/events` — skipped by `compression` in `app.ts`. */
export function isAgentEventStreamPath(path: string): boolean {
  return /^\/api\/agent\/runs\/[^/]+\/events\/?$/.test(path);
}

const TERMINAL_TYPES = new Set<AgentStreamEvent['type']>(['run.completed', 'run.failed', 'run.cancelled']);

export function isTerminalAgentEvent(event: AgentStreamEvent): boolean {
  return TERMINAL_TYPES.has(event.type);
}

function resumedBaseId(): number {
  return Date.now() * 1000;
}

export interface AgentEventStore {
  readonly kind: 'memory' | 'redis';
  /**
   * Starts a log (idempotent). `resumed`: the run existed before this log (restart /
   * expired), so ids must start above anything handed out earlier.
   */
  open(runId: string, options?: { resumed?: boolean }): Promise<void>;
  has(runId: string): Promise<boolean>;
  /**
   * Appends and fans out. Ignored (null) after the terminal event or on store errors.
   * Through `CoalescingAgentEventStore` a `text.delta` resolves null right away and is
   * stored (merged with its neighbours) on the next flush.
   */
  append(runId: string, event: AgentStreamEvent): Promise<AgentStoredEvent | null>;
  /** Events with id > afterId, in id order. */
  read(runId: string, afterId: number): Promise<AgentStoredEvent[]>;
  isTerminal(runId: string): Promise<boolean>;
  /** Live listener; may deliver ids the caller already read (dedupe by id). */
  subscribe(runId: string, listener: AgentEventListener): () => void;
  /** Resolves once every event appended so far is stored (coalesced text included). */
  flush(runId: string): Promise<void>;
}

// --- in-memory -----------------------------------------------------------------------------

type RunLog = {
  events: AgentStoredEvent[];
  nextId: number;
  terminal: boolean;
  listeners: Set<AgentEventListener>;
  expiryTimer: NodeJS.Timeout | null;
};

export class InMemoryAgentEventStore implements AgentEventStore {
  readonly kind = 'memory' as const;
  private readonly logs = new Map<string, RunLog>();

  constructor(private readonly retentionMs: number = AGENT_EVENT_RETENTION_MS) {}

  private ensure(runId: string, resumed = false): RunLog {
    let log = this.logs.get(runId);
    if (!log) {
      log = {
        events: [],
        nextId: resumed ? resumedBaseId() : 1,
        terminal: false,
        listeners: new Set(),
        expiryTimer: null,
      };
      this.logs.set(runId, log);
    }
    return log;
  }

  async open(runId: string, options: { resumed?: boolean } = {}): Promise<void> {
    this.ensure(runId, options.resumed);
  }

  async has(runId: string): Promise<boolean> {
    return this.logs.has(runId);
  }

  async append(runId: string, event: AgentStreamEvent): Promise<AgentStoredEvent | null> {
    return this.appendSync(runId, event);
  }

  /** Synchronous core (also used by tests). */
  appendSync(runId: string, event: AgentStreamEvent): AgentStoredEvent | null {
    const log = this.ensure(runId);
    if (log.terminal) return null;
    const terminal = isTerminalAgentEvent(event);
    // Never drop the terminal event; drop the rest once a runaway run hits the cap.
    if (!terminal && log.events.length >= AGENT_MAX_EVENTS_PER_RUN) return null;
    const stored: AgentStoredEvent = { id: log.nextId++, event };
    log.events.push(stored);
    if (terminal) {
      log.terminal = true;
      log.expiryTimer = setTimeout(() => this.logs.delete(runId), this.retentionMs);
      log.expiryTimer.unref?.();
    }
    for (const listener of [...log.listeners]) {
      try {
        listener(stored);
      } catch (error) {
        console.error('[agent] event listener failed', error);
      }
    }
    if (terminal) log.listeners.clear();
    return stored;
  }

  async read(runId: string, afterId: number): Promise<AgentStoredEvent[]> {
    const log = this.logs.get(runId);
    if (!log) return [];
    return log.events.filter((stored) => stored.id > afterId);
  }

  async isTerminal(runId: string): Promise<boolean> {
    return this.logs.get(runId)?.terminal ?? false;
  }

  async flush(): Promise<void> {}

  subscribe(runId: string, listener: AgentEventListener): () => void {
    const log = this.logs.get(runId);
    if (!log || log.terminal) return () => {};
    log.listeners.add(listener);
    return () => {
      log.listeners.delete(listener);
    };
  }

  /** Tests only. */
  clear(): void {
    for (const log of this.logs.values()) {
      if (log.expiryTimer) clearTimeout(log.expiryTimer);
    }
    this.logs.clear();
  }
}

// --- Redis ---------------------------------------------------------------------------------

export type AgentRedisKeys = { seq: string; events: string; terminal: string };

/** The few Redis operations the store needs (fakeable in tests). */
export interface AgentRedisPort {
  setNx(key: string, value: string, ttlSec: number): Promise<boolean>;
  exists(key: string): Promise<boolean>;
  /**
   * `AGENT_APPEND_SCRIPT`, one round trip: unless the log is terminal (or over the cap for a
   * non-terminal event) INCR the id, ZADD `{"id":<id>,"event":<eventJson>}`, set the terminal
   * flag, refresh TTLs and PUBLISH the stored JSON on `channel`. Returns the id, or null.
   */
  append(
    keys: AgentRedisKeys,
    input: { eventJson: string; terminal: boolean; maxEvents: number; ttlSec: number; channel: string },
  ): Promise<number | null>;
  /** Members with score > afterScore, ascending. */
  zRangeAfter(key: string, afterScore: number): Promise<string[]>;
  /** Resolves once the server confirmed the subscription. */
  subscribe(channel: string, onMessage: (message: string) => void): Promise<void>;
  /** Removes that handler; the channel is dropped once it has none. */
  unsubscribe(channel: string, onMessage: (message: string) => void): Promise<void>;
}

/**
 * Atomic append. Ids are formatted with `%.0f`: resumed ids (~1.8e15) are exact doubles but
 * Lua's default number formatting (`%.14g`) would round them.
 */
export const AGENT_APPEND_SCRIPT = new RedisScript(`
if redis.call('EXISTS', KEYS[3]) == 1 then return false end
local terminal = ARGV[2] == '1'
if not terminal and redis.call('ZCARD', KEYS[2]) >= tonumber(ARGV[3]) then return false end
local id = string.format('%.0f', redis.call('INCR', KEYS[1]))
local stored = '{"id":' .. id .. ',"event":' .. ARGV[1] .. '}'
redis.call('ZADD', KEYS[2], id, stored)
if terminal then redis.call('SET', KEYS[3], '1', 'EX', ARGV[4]) end
redis.call('EXPIRE', KEYS[2], ARGV[4])
redis.call('EXPIRE', KEYS[1], ARGV[4])
redis.call('PUBLISH', ARGV[5], stored)
return id
`);

export function nodeRedisAgentPort(): AgentRedisPort {
  const client = async () => {
    const redis = await getRedisClient();
    if (!redis) throw new Error('Redis unavailable');
    return redis;
  };
  const subscriber = async () => {
    const sub = await getRedisSubscriber();
    if (!sub) throw new Error('Redis subscriber unavailable');
    return sub;
  };
  return {
    async setNx(key, value, ttlSec) {
      return (await (await client()).set(key, value, { condition: 'NX', expiration: { type: 'EX', value: ttlSec } })) === 'OK';
    },
    async exists(key) {
      return (await (await client()).exists(key)) > 0;
    },
    async append(keys, input) {
      const reply = await AGENT_APPEND_SCRIPT.run(
        await client(),
        [keys.seq, keys.events, keys.terminal],
        [input.eventJson, input.terminal ? '1' : '0', String(input.maxEvents), String(input.ttlSec), input.channel],
      );
      return reply == null ? null : Number(reply);
    },
    async zRangeAfter(key, afterScore) {
      return (await (await client()).zRange(key, `(${afterScore}`, '+inf', { BY: 'SCORE' })).map(String);
    },
    async subscribe(channel, onMessage) {
      await (await subscriber()).subscribe(channel, onMessage);
    },
    async unsubscribe(channel, onMessage) {
      await (await subscriber()).unsubscribe(channel, onMessage);
    },
  };
}

const REDIS_KEY_PREFIX = 'pp:agent:run:';
/** One pub/sub channel per run: a process only receives runs it has stream listeners for. */
export const AGENT_EVENTS_CHANNEL_PREFIX = 'pp:agent:run-events:';

export function agentEventsChannel(runId: string): string {
  return `${AGENT_EVENTS_CHANNEL_PREFIX}${runId}`;
}

type RedisRunSubscription = {
  listeners: Set<AgentEventListener>;
  onMessage: (message: string) => void;
  /** SUBSCRIBE confirmed (or failed): `read` waits for it so no event falls in between. */
  ready: Promise<void>;
};

export class RedisAgentEventStore implements AgentEventStore {
  readonly kind = 'redis' as const;
  private readonly subscriptions = new Map<string, RedisRunSubscription>();

  constructor(
    private readonly redis: AgentRedisPort,
    private readonly retentionMs: number = AGENT_EVENT_RETENTION_MS,
  ) {}

  private keys(runId: string): AgentRedisKeys {
    const base = `${REDIS_KEY_PREFIX}${runId}`;
    return { seq: `${base}:seq`, events: `${base}:ev`, terminal: `${base}:term` };
  }

  private async guard<T>(label: string, fallback: T, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      console.error(`[agent] redis event store ${label} failed`, error);
      return fallback;
    }
  }

  async open(runId: string, options: { resumed?: boolean } = {}): Promise<void> {
    const keys = this.keys(runId);
    await this.guard('open', undefined, async () => {
      const seed = options.resumed ? String(resumedBaseId() - 1) : '0';
      await this.redis.setNx(keys.seq, seed, Math.ceil(AGENT_EVENT_OPEN_TTL_MS / 1000));
    });
  }

  async has(runId: string): Promise<boolean> {
    return this.guard('has', false, () => this.redis.exists(this.keys(runId).seq));
  }

  async append(runId: string, event: AgentStreamEvent): Promise<AgentStoredEvent | null> {
    return this.guard('append', null, async () => {
      const terminal = isTerminalAgentEvent(event);
      const id = await this.redis.append(this.keys(runId), {
        eventJson: JSON.stringify(event),
        terminal,
        maxEvents: AGENT_MAX_EVENTS_PER_RUN,
        ttlSec: Math.ceil((terminal ? this.retentionMs : AGENT_EVENT_OPEN_TTL_MS) / 1000),
        channel: agentEventsChannel(runId),
      });
      return id == null ? null : { id, event };
    });
  }

  async read(runId: string, afterId: number): Promise<AgentStoredEvent[]> {
    await this.subscriptions.get(runId)?.ready;
    return this.guard('read', [], async () =>
      (await this.redis.zRangeAfter(this.keys(runId).events, afterId)).map((raw) => JSON.parse(raw) as AgentStoredEvent),
    );
  }

  async isTerminal(runId: string): Promise<boolean> {
    return this.guard('isTerminal', false, () => this.redis.exists(this.keys(runId).terminal));
  }

  async flush(): Promise<void> {}

  subscribe(runId: string, listener: AgentEventListener): () => void {
    let subscription = this.subscriptions.get(runId);
    if (!subscription) {
      const listeners = new Set<AgentEventListener>();
      const onMessage = (message: string) => {
        let stored: AgentStoredEvent;
        try {
          stored = JSON.parse(message) as AgentStoredEvent;
        } catch {
          return;
        }
        for (const current of [...listeners]) {
          try {
            current(stored);
          } catch (error) {
            console.error('[agent] event listener failed', error);
          }
        }
      };
      const ready = this.redis
        .subscribe(agentEventsChannel(runId), onMessage)
        .catch((error) => console.error('[agent] redis event subscribe failed', { runId, error }));
      subscription = { listeners, onMessage, ready };
      this.subscriptions.set(runId, subscription);
    }
    const own = subscription;
    own.listeners.add(listener);
    return () => {
      if (!own.listeners.delete(listener) || own.listeners.size > 0) return;
      if (this.subscriptions.get(runId) === own) this.subscriptions.delete(runId);
      // node-redis keeps the channel while another handler (a newer subscription) is on it.
      void own.ready
        .then(() => this.redis.unsubscribe(agentEventsChannel(runId), own.onMessage))
        .catch((error) => console.error('[agent] redis event unsubscribe failed', { runId, error }));
    };
  }

  /** Runs this process holds a channel for (tests). */
  subscribedRunIds(): string[] {
    return [...this.subscriptions.keys()];
  }
}

// --- text.delta coalescing -----------------------------------------------------------------

/** How long consecutive `text.delta`s of a run are merged before they are stored. */
export const AGENT_TEXT_DELTA_COALESCE_MS = 50;

type CoalesceState = {
  text: string;
  timer: NodeJS.Timeout | null;
  /** Appends of this run, chained so they reach the store in call order. */
  tail: Promise<unknown>;
};

/**
 * Wraps a store so a run's consecutive `text.delta`s become one delta per
 * `AGENT_TEXT_DELTA_COALESCE_MS` (concatenated text: clients append it as usual). Any other
 * event first stores the pending text, so order is kept; ids stay monotonic and replay holds
 * every character. A delta's `append` resolves null at once (the LLM loop never waits on the
 * store per token); `flush` waits until everything appended so far is stored.
 */
export class CoalescingAgentEventStore implements AgentEventStore {
  private readonly runs = new Map<string, CoalesceState>();

  constructor(
    readonly inner: AgentEventStore,
    private readonly flushMs: number = AGENT_TEXT_DELTA_COALESCE_MS,
  ) {}

  get kind(): AgentEventStore['kind'] {
    return this.inner.kind;
  }

  private state(runId: string): CoalesceState {
    let state = this.runs.get(runId);
    if (!state) {
      state = { text: '', timer: null, tail: Promise.resolve() };
      this.runs.set(runId, state);
    }
    return state;
  }

  private enqueue<T>(state: CoalesceState, fn: () => Promise<T>): Promise<T> {
    const result = state.tail.then(fn, fn);
    state.tail = result.catch(() => undefined);
    return result;
  }

  /** Queues the pending text (if any) as one delta. */
  private takePending(runId: string, state: CoalesceState): void {
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
    if (!state.text) return;
    const text = state.text;
    state.text = '';
    void this.enqueue(state, () => this.inner.append(runId, { type: 'text.delta', text }));
  }

  /** Drops the run's state once its chain is idle and nothing is pending. */
  private release(runId: string, state: CoalesceState): void {
    const tail = state.tail;
    void tail.then(() => {
      if (this.runs.get(runId) === state && state.tail === tail && !state.text && !state.timer) this.runs.delete(runId);
    });
  }

  open(runId: string, options?: { resumed?: boolean }): Promise<void> {
    return this.inner.open(runId, options);
  }

  has(runId: string): Promise<boolean> {
    return this.inner.has(runId);
  }

  async append(runId: string, event: AgentStreamEvent): Promise<AgentStoredEvent | null> {
    const state = this.state(runId);
    if (event.type === 'text.delta') {
      state.text += event.text;
      if (!state.timer) {
        state.timer = setTimeout(() => {
          state.timer = null;
          this.takePending(runId, state);
          this.release(runId, state);
        }, this.flushMs);
        state.timer.unref?.();
      }
      return null;
    }
    this.takePending(runId, state);
    const result = this.enqueue(state, () => this.inner.append(runId, event));
    this.release(runId, state);
    return result;
  }

  async flush(runId: string): Promise<void> {
    const state = this.runs.get(runId);
    if (!state) return;
    this.takePending(runId, state);
    this.release(runId, state);
    await state.tail;
    await this.inner.flush(runId);
  }

  read(runId: string, afterId: number): Promise<AgentStoredEvent[]> {
    return this.inner.read(runId, afterId);
  }

  isTerminal(runId: string): Promise<boolean> {
    return this.inner.isTerminal(runId);
  }

  subscribe(runId: string, listener: AgentEventListener): () => void {
    return this.inner.subscribe(runId, listener);
  }

  /** Runs with buffered text or appends in flight (tests). */
  pendingRunCount(): number {
    return this.runs.size;
  }
}

// --- helpers -------------------------------------------------------------------------------

/** One SSE frame. `data` is single-line JSON, so one `data:` line is enough. */
export function formatAgentSseFrame(stored: AgentStoredEvent): string {
  return `id: ${stored.id}\nevent: ${stored.event.type}\ndata: ${JSON.stringify(stored.event)}\n\n`;
}

export const AGENT_SSE_KEEPALIVE_FRAME = ': keepalive\n\n';

/**
 * Replay cursor from `?after=` and/or `Last-Event-ID`: the larger valid non-negative
 * integer wins (both are "what I already have"); garbage → 0 (replay everything).
 */
export function parseAgentReplayCursor(
  queryAfter: unknown,
  lastEventIdHeader: string | string[] | undefined,
): number {
  const candidates = [
    Array.isArray(queryAfter) ? queryAfter[0] : queryAfter,
    Array.isArray(lastEventIdHeader) ? lastEventIdHeader[0] : lastEventIdHeader,
  ];
  let best = 0;
  for (const raw of candidates) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!/^\d{1,16}$/.test(trimmed)) continue;
    const value = Number(trimmed);
    if (Number.isSafeInteger(value) && value > best) best = value;
  }
  return best;
}

/** Synthetic replay from DB state (see file header). */
export function buildSyntheticAgentReplay(events: AgentStreamEvent[], afterId: number): AgentStoredEvent[] {
  return events
    .map((event, index) => ({ id: AGENT_SYNTHETIC_EVENT_ID_BASE + index + 1, event }))
    .filter((stored) => stored.id > afterId);
}

let defaultStore: AgentEventStore | null = null;

/** Redis when configured (shared across processes), else in-memory; text deltas coalesced. */
export function getAgentEventStore(): AgentEventStore {
  if (!defaultStore) {
    const inner = isRedisConfigured() ? new RedisAgentEventStore(nodeRedisAgentPort()) : new InMemoryAgentEventStore();
    defaultStore = new CoalescingAgentEventStore(inner);
  }
  return defaultStore;
}
