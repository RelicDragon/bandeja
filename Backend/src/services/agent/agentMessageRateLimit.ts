/**
 * Per-user agent message quota (`AGENT_RATE_LIMIT_MAX` per `AGENT_RATE_LIMIT_WINDOW_MS`),
 * one bucket for every channel. The HTTP route's `express-rate-limit` middleware uses this
 * store (keyed by user id); the Telegram assistant increments the same key through
 * `consumeAgentMessageQuota`, so a user can't double their quota by switching channels.
 * In-process (MemoryStore): the API process serves both HTTP and the bot's long polling.
 */
import { MemoryStore, type Options } from 'express-rate-limit';
import { config } from '../../config/env';
import { agentApiError } from './agentGuards';

export const agentMessageRateStore = new MemoryStore();

let initializedWindowMs: number | null = null;

function ensureStoreInitialized(): void {
  const windowMs = config.agent.rateLimitWindowMs;
  if (initializedWindowMs === windowMs) return;
  // `express-rate-limit` calls `init` itself when the route limiter is built; calling it
  // again only restarts the expiry timer, so this is safe in either order.
  agentMessageRateStore.init({ windowMs } as Options);
  initializedWindowMs = windowMs;
}

/** Marks the store initialized by the route limiter (avoids a redundant re-init). */
export function noteAgentMessageRateStoreInitialized(windowMs: number): void {
  initializedWindowMs = windowMs;
}

export const AGENT_RATE_LIMIT_MESSAGE = 'Too many messages to the assistant. Please wait a few minutes.';

/** Counts one message for `userId`; throws 429 `RATE_LIMITED` once over the limit. */
export async function consumeAgentMessageQuota(userId: string): Promise<void> {
  ensureStoreInitialized();
  const info = await agentMessageRateStore.increment(userId);
  if (info.totalHits > config.agent.rateLimitMax) {
    throw agentApiError(429, 'RATE_LIMITED', AGENT_RATE_LIMIT_MESSAGE);
  }
}
