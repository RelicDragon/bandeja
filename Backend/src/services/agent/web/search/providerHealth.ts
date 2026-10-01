/**
 * Per-provider circuit breaker (port of travel-bandeja `providerHealth.js`,
 * docs/plans/ai-agent-web-search.md §13.5).
 *
 * A failing provider cools down for `base(kind) × min(consecutiveFailures, 5)`, capped at
 * 15 min; a `Retry-After` from the provider wins exactly. One success resets it. Memory
 * only: a restart clears every cooldown, which is what we want.
 */
import { COOLDOWN_MS_BY_KIND, type WebSearchErrorKind } from './webSearchError';

export const MAX_COOLDOWN_MS = 15 * 60_000;
export const MAX_BACKOFF_FACTOR = 5;

export type ProviderHealthState = {
  consecutiveFailures: number;
  cooldownUntil: number;
  lastError: WebSearchErrorKind | null;
  lastFailedAt: number | null;
};

const EMPTY_STATE: ProviderHealthState = { consecutiveFailures: 0, cooldownUntil: 0, lastError: null, lastFailedAt: null };

export class ProviderHealthTracker {
  private readonly state = new Map<string, ProviderHealthState>();

  constructor(private readonly clock: () => number = Date.now) {}

  isHealthy(name: string, now: () => number = this.clock): boolean {
    const s = this.state.get(name);
    return !s || s.cooldownUntil <= now();
  }

  snapshot(name: string): ProviderHealthState {
    return { ...(this.state.get(name) ?? EMPTY_STATE) };
  }

  recordSuccess(name: string): void {
    this.state.delete(name);
  }

  recordFailure(
    name: string,
    info: { kind?: WebSearchErrorKind; retryAfterMs?: number | null } = {},
    now: () => number = this.clock,
  ): void {
    const kind = info.kind ?? 'unknown';
    const base = COOLDOWN_MS_BY_KIND[kind] ?? COOLDOWN_MS_BY_KIND.unknown;
    const consecutiveFailures = (this.state.get(name)?.consecutiveFailures ?? 0) + 1;
    const cooldownMs =
      typeof info.retryAfterMs === 'number' && Number.isFinite(info.retryAfterMs)
        ? Math.min(info.retryAfterMs, MAX_COOLDOWN_MS)
        : Math.min(base * Math.min(consecutiveFailures, MAX_BACKOFF_FACTOR), MAX_COOLDOWN_MS);
    const at = now();
    this.state.set(name, { consecutiveFailures, cooldownUntil: at + cooldownMs, lastError: kind, lastFailedAt: at });
  }

  clear(): void {
    this.state.clear();
  }
}
