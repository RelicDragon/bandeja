/**
 * In-memory TTL cache + single-flight shared by web search and web fetch
 * (docs/plans/ai-agent-web-search.md §13.6; port of the `cache` / `inFlight` maps in
 * travel-bandeja `webSearchChain.js` and `webFetchService.js`).
 *
 * Per process on purpose: prod runs one pm2 process without `REDIS_URL`; with Redis every
 * process keeps its own copy, which only costs an extra provider call.
 * FIFO eviction through Map insertion order; expired entries are dropped on read.
 */

export type TtlCacheOptions = {
  ttlMs: () => number;
  max: () => number;
  now?: () => number;
};

export class TtlCache<V> {
  private readonly entries = new Map<string, { value: V; expiresAt: number }>();
  private readonly inFlight = new Map<string, Promise<V>>();

  constructor(private readonly options: TtlCacheOptions) {}

  private now(): number {
    return (this.options.now ?? Date.now)();
  }

  get(key: string): V | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (this.now() >= entry.expiresAt) {
      this.entries.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key: string, value: V): void {
    const ttl = this.options.ttlMs();
    const max = this.options.max();
    if (ttl <= 0 || max <= 0) return;
    if (this.entries.has(key)) this.entries.delete(key);
    while (this.entries.size >= max) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
    this.entries.set(key, { value, expiresAt: this.now() + ttl });
  }

  /** Concurrent callers with the same key share one task. */
  singleFlight(key: string, task: () => Promise<V>): { promise: Promise<V>; joined: boolean } {
    const existing = this.inFlight.get(key);
    if (existing) return { promise: existing, joined: true };
    const promise = task().finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, promise);
    return { promise, joined: false };
  }

  get size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
    this.inFlight.clear();
  }
}
