/**
 * Per-user agent message quota (`AGENT_RATE_LIMIT_MAX` per `AGENT_RATE_LIMIT_WINDOW_MS`),
 * one bucket for every channel. The HTTP route's `express-rate-limit` middleware uses this
 * store (keyed by user id); the Telegram assistant increments the same key through
 * `consumeAgentMessageQuota`, so a user can't double their quota by switching channels.
 *
 * Shared across processes (pm2 cluster) when `REDIS_URL` is set: a fixed window per user,
 * one atomic INCR + PEXPIRE script per message (`pp:agent:msg-rate:<userId>`). Without Redis,
 * or while it is unreachable, an in-process `MemoryStore` counts instead (per process).
 */
import { MemoryStore, type IncrementResponse, type Options, type Store } from 'express-rate-limit';
import { config } from '../../config/env';
import { getRedisClient, isRedisConfigured } from '../redis/redisClient';
import { RedisScript } from '../redis/redisScript';
import { agentApiError } from './agentGuards';

/** The Redis side of the store (fakeable in tests). */
export interface AgentRateRedisPort {
  /** Increments `key`; starts its window (`windowMs`) on the first hit. */
  increment(key: string, windowMs: number): Promise<{ totalHits: number; ttlMs: number }>;
  decrement(key: string): Promise<void>;
  reset(key: string): Promise<void>;
}

const INCREMENT_SCRIPT = new RedisScript(`
local hits = redis.call('INCR', KEYS[1])
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {hits, ttl}
`);

const DECREMENT_SCRIPT = new RedisScript(`
local hits = tonumber(redis.call('GET', KEYS[1]) or '0')
if hits > 0 then redis.call('DECR', KEYS[1]) end
return 0
`);

/** `null` when Redis isn't configured or can't be reached (the store falls back to memory). */
export function nodeRedisAgentRatePort(): AgentRateRedisPort | null {
  if (!isRedisConfigured()) return null;
  const client = async () => {
    const redis = await getRedisClient();
    if (!redis) throw new Error('Redis unavailable');
    return redis;
  };
  return {
    async increment(key, windowMs) {
      const reply = (await INCREMENT_SCRIPT.run(await client(), [key], [String(windowMs)])) as [number, number];
      return { totalHits: Number(reply[0]), ttlMs: Number(reply[1]) };
    },
    async decrement(key) {
      await DECREMENT_SCRIPT.run(await client(), [key], []);
    },
    async reset(key) {
      await (await client()).del(key);
    },
  };
}

export class AgentMessageRateStore implements Store {
  readonly localKeys: boolean;
  readonly prefix = 'pp:agent:msg-rate:';
  private readonly memory = new MemoryStore();
  private windowMs = 60_000;

  constructor(private readonly redis: AgentRateRedisPort | null) {
    this.localKeys = redis === null;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
    this.memory.init(options);
  }

  private async viaRedis<T>(label: string, fn: (redis: AgentRateRedisPort) => Promise<T>): Promise<T | undefined> {
    if (!this.redis) return undefined;
    try {
      return await fn(this.redis);
    } catch (error) {
      console.error(`[agent] redis rate limit ${label} failed; counting in memory`, error);
      return undefined;
    }
  }

  async increment(key: string): Promise<IncrementResponse> {
    const shared = await this.viaRedis('increment', (redis) => redis.increment(this.prefix + key, this.windowMs));
    if (shared) return { totalHits: shared.totalHits, resetTime: new Date(Date.now() + shared.ttlMs) };
    return this.memory.increment(key);
  }

  async decrement(key: string): Promise<void> {
    if ((await this.viaRedis('decrement', (redis) => redis.decrement(this.prefix + key).then(() => true))) === true) return;
    await this.memory.decrement(key);
  }

  async resetKey(key: string): Promise<void> {
    await this.viaRedis('reset', (redis) => redis.reset(this.prefix + key));
    await this.memory.resetKey(key);
  }

  shutdown(): void {
    this.memory.shutdown();
  }
}

export const agentMessageRateStore = new AgentMessageRateStore(nodeRedisAgentRatePort());

let initializedWindowMs: number | null = null;

function ensureStoreInitialized(): void {
  const windowMs = config.agent.rateLimitWindowMs;
  if (initializedWindowMs === windowMs) return;
  // `express-rate-limit` calls `init` itself when the route limiter is built; calling it
  // again only restarts the memory fallback's expiry timer, so this is safe in either order.
  agentMessageRateStore.init({ windowMs } as Options);
  initializedWindowMs = windowMs;
}

/** Marks the store initialized by the route limiter (avoids a redundant re-init). */
export function noteAgentMessageRateStoreInitialized(windowMs: number): void {
  initializedWindowMs = windowMs;
}

export const AGENT_RATE_LIMIT_MESSAGE = 'Too many messages to the assistant. Please wait a few minutes.';

/** Counts one message for `userId`; throws 429 `RATE_LIMITED` (with `retryAt`) once over the limit. */
export async function consumeAgentMessageQuota(userId: string): Promise<void> {
  ensureStoreInitialized();
  const info = await agentMessageRateStore.increment(userId);
  if (info.totalHits > config.agent.rateLimitMax) {
    throw agentApiError(429, 'RATE_LIMITED', AGENT_RATE_LIMIT_MESSAGE, { retryAt: info.resetTime });
  }
}
