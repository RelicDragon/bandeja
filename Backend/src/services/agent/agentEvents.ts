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
 *     for ids, a sorted set (score = id) for events, a terminal flag, and one pub/sub
 *     channel for live fan-out.
 *   - `InMemoryAgentEventStore` otherwise: only valid when the process that executes runs
 *     also serves HTTP, so without Redis the agent queue runs in the API process only
 *     (`AgentRunQueueService`).
 *
 * When a log is gone (expired, Redis down, in-memory restart) the stream is rebuilt from
 * the database with ids from `AGENT_SYNTHETIC_EVENT_ID_BASE`, above any live id. A log
 * re-opened for a run that already existed (`resumed`) starts at `Date.now() * 1000`, so its
 * ids stay above whatever an earlier in-memory log of the same run handed out.
 */
import type { AgentStreamEvent } from '@bandeja/shared/agentContract';
import { getRedisClient, getRedisSubscriber, isRedisConfigured } from '../redis/redisClient';

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
  /** Appends and fans out. Ignored (null) after the terminal event or on store errors. */
  append(runId: string, event: AgentStreamEvent): Promise<AgentStoredEvent | null>;
  /** Events with id > afterId, in id order. */
  read(runId: string, afterId: number): Promise<AgentStoredEvent[]>;
  isTerminal(runId: string): Promise<boolean>;
  /** Live listener; may deliver ids the caller already read (dedupe by id). */
  subscribe(runId: string, listener: AgentEventListener): () => void;
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

/** The few Redis commands the store needs (fakeable in tests). */
export interface AgentRedisPort {
  setNx(key: string, value: string, ttlSec: number): Promise<boolean>;
  exists(key: string): Promise<boolean>;
  incr(key: string): Promise<number>;
  zAdd(key: string, score: number, member: string): Promise<void>;
  /** Members with score > afterScore, ascending. */
  zRangeAfter(key: string, afterScore: number): Promise<string[]>;
  set(key: string, value: string, ttlSec: number): Promise<void>;
  expire(key: string, ttlSec: number): Promise<void>;
  zCard(key: string): Promise<number>;
  publish(channel: string, message: string): Promise<void>;
  subscribe(channel: string, onMessage: (message: string) => void): Promise<void>;
}

export function nodeRedisAgentPort(): AgentRedisPort {
  const client = async () => {
    const redis = await getRedisClient();
    if (!redis) throw new Error('Redis unavailable');
    return redis;
  };
  return {
    async setNx(key, value, ttlSec) {
      return (await (await client()).set(key, value, { condition: 'NX', expiration: { type: 'EX', value: ttlSec } })) === 'OK';
    },
    async exists(key) {
      return (await (await client()).exists(key)) > 0;
    },
    async incr(key) {
      return Number(await (await client()).incr(key));
    },
    async zAdd(key, score, member) {
      await (await client()).zAdd(key, { score, value: member });
    },
    async zRangeAfter(key, afterScore) {
      return (await (await client()).zRange(key, `(${afterScore}`, '+inf', { BY: 'SCORE' })).map(String);
    },
    async set(key, value, ttlSec) {
      await (await client()).set(key, value, { expiration: { type: 'EX', value: ttlSec } });
    },
    async expire(key, ttlSec) {
      await (await client()).expire(key, ttlSec);
    },
    async zCard(key) {
      return Number(await (await client()).zCard(key));
    },
    async publish(channel, message) {
      await (await client()).publish(channel, message);
    },
    async subscribe(channel, onMessage) {
      const sub = await getRedisSubscriber();
      if (!sub) throw new Error('Redis subscriber unavailable');
      await sub.subscribe(channel, (message) => onMessage(String(message)));
    },
  };
}

const REDIS_KEY_PREFIX = 'pp:agent:run:';
export const AGENT_EVENTS_CHANNEL = 'pp:agent:run-events';

export class RedisAgentEventStore implements AgentEventStore {
  readonly kind = 'redis' as const;
  private readonly listeners = new Map<string, Set<AgentEventListener>>();
  private subscribed: Promise<void> | null = null;

  constructor(
    private readonly redis: AgentRedisPort,
    private readonly retentionMs: number = AGENT_EVENT_RETENTION_MS,
  ) {}

  private keys(runId: string) {
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
    const keys = this.keys(runId);
    return this.guard('append', null, async () => {
      if (await this.redis.exists(keys.terminal)) return null;
      const terminal = isTerminalAgentEvent(event);
      if (!terminal && (await this.redis.zCard(keys.events)) >= AGENT_MAX_EVENTS_PER_RUN) return null;
      const id = await this.redis.incr(keys.seq);
      const stored: AgentStoredEvent = { id, event };
      await this.redis.zAdd(keys.events, id, JSON.stringify(stored));
      const ttl = Math.ceil((terminal ? this.retentionMs : AGENT_EVENT_OPEN_TTL_MS) / 1000);
      if (terminal) await this.redis.set(keys.terminal, '1', ttl);
      await this.redis.expire(keys.events, ttl);
      await this.redis.expire(keys.seq, ttl);
      await this.redis.publish(AGENT_EVENTS_CHANNEL, JSON.stringify({ runId, stored }));
      return stored;
    });
  }

  async read(runId: string, afterId: number): Promise<AgentStoredEvent[]> {
    return this.guard('read', [], async () =>
      (await this.redis.zRangeAfter(this.keys(runId).events, afterId)).map((raw) => JSON.parse(raw) as AgentStoredEvent),
    );
  }

  async isTerminal(runId: string): Promise<boolean> {
    return this.guard('isTerminal', false, () => this.redis.exists(this.keys(runId).terminal));
  }

  private ensureSubscribed(): void {
    if (this.subscribed) return;
    this.subscribed = this.redis
      .subscribe(AGENT_EVENTS_CHANNEL, (message) => {
        let parsed: { runId: string; stored: AgentStoredEvent };
        try {
          parsed = JSON.parse(message);
        } catch {
          return;
        }
        for (const listener of [...(this.listeners.get(parsed.runId) ?? [])]) {
          try {
            listener(parsed.stored);
          } catch (error) {
            console.error('[agent] event listener failed', error);
          }
        }
      })
      .catch((error) => {
        console.error('[agent] redis event subscribe failed', error);
        this.subscribed = null;
      });
  }

  subscribe(runId: string, listener: AgentEventListener): () => void {
    this.ensureSubscribed();
    let set = this.listeners.get(runId);
    if (!set) {
      set = new Set();
      this.listeners.set(runId, set);
    }
    set.add(listener);
    return () => {
      const current = this.listeners.get(runId);
      current?.delete(listener);
      if (current && current.size === 0) this.listeners.delete(runId);
    };
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

/** Redis when configured (shared across processes), else in-memory. */
export function getAgentEventStore(): AgentEventStore {
  if (!defaultStore) {
    defaultStore = isRedisConfigured() ? new RedisAgentEventStore(nodeRedisAgentPort()) : new InMemoryAgentEventStore();
  }
  return defaultStore;
}
