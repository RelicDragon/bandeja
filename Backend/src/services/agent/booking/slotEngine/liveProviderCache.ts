/**
 * Live provider calls from the slot engine are cached for 60 s per key (club, date, duration)
 * and rate-limited per provider: one server IP acts
 * for many users, so a burst of agent searches must not hammer Nspadel or Weltner.
 * Concurrent callers of the same key share one in-flight request. In-process only: each
 * API/worker process has its own budget.
 */
export const LIVE_PROVIDER_CACHE_TTL_MS = 60_000;
export const LIVE_PROVIDER_RATE_WINDOW_MS = 60_000;
/** Upstream fetches per provider per minute per process (a club search is one fetch). */
export const LIVE_PROVIDER_RATE_LIMIT = 30;

export class ProviderRateLimitedError extends Error {
  constructor(readonly provider: string) {
    super(`Live provider ${provider} is rate limited`);
  }
}

type Entry = { value: unknown; expiresAt: number };

export class LiveProviderCache {
  private readonly entries = new Map<string, Entry>();
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private readonly calls = new Map<string, number[]>();

  constructor(
    private readonly clock: () => number = Date.now,
    private readonly ttlMs = LIVE_PROVIDER_CACHE_TTL_MS,
    private readonly rateLimit = LIVE_PROVIDER_RATE_LIMIT,
    private readonly rateWindowMs = LIVE_PROVIDER_RATE_WINDOW_MS,
  ) {}

  /** Cached value (and when it was fetched) or a fresh fetch through the provider's budget. */
  async get<T>(provider: string, key: string, load: () => Promise<T>): Promise<{ value: T; fetchedAt: Date }> {
    const cacheKey = `${provider}:${key}`;
    const now = this.clock();
    const hit = this.entries.get(cacheKey);
    if (hit && hit.expiresAt > now) {
      return hit.value as { value: T; fetchedAt: Date };
    }
    const pending = this.inFlight.get(cacheKey);
    if (pending) return pending as Promise<{ value: T; fetchedAt: Date }>;

    this.takeBudget(provider, now);
    const promise = (async () => {
      const value = await load();
      const result = { value, fetchedAt: new Date(this.clock()) };
      this.entries.set(cacheKey, { value: result, expiresAt: this.clock() + this.ttlMs });
      this.prune();
      return result;
    })();
    this.inFlight.set(cacheKey, promise);
    try {
      return await promise;
    } finally {
      this.inFlight.delete(cacheKey);
    }
  }

  clear(): void {
    this.entries.clear();
    this.inFlight.clear();
    this.calls.clear();
  }

  private takeBudget(provider: string, now: number): void {
    const recent = (this.calls.get(provider) ?? []).filter((at) => at > now - this.rateWindowMs);
    if (recent.length >= this.rateLimit) {
      this.calls.set(provider, recent);
      throw new ProviderRateLimitedError(provider);
    }
    recent.push(now);
    this.calls.set(provider, recent);
  }

  private prune(): void {
    if (this.entries.size < 500) return;
    const now = this.clock();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
  }
}

export const liveProviderCache = new LiveProviderCache();
