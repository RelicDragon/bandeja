/**
 * Web search failover chain (port of travel-bandeja `webSearchChain.js` + `index.js`).
 *
 * The single entry point for a search. It owns the cross-cutting concerns so adapters
 * stay dumb: cache, single-flight, the `admit` hook (global rate limit, checked only on a
 * cache miss), rotation (§13.4), the circuit breaker (§13.5) and failover. It never
 * throws: exhaustion, kill switch, empty query and refusal come back as flags.
 *
 * `createWebSearchChain(deps)` builds an isolated instance (tests inject `fetchImpl`, env
 * and a clock); the module singleton below is what the tools use.
 */
import {
  agentWebEnv,
  isAgentWebSearchOn,
  type AgentWebEnvConfig,
} from '../../../../config/agentWebEnv';
import { TtlCache } from '../webTtlCache';
import { ProviderHealthTracker, type ProviderHealthState } from './providerHealth';
import { ProviderRotation } from './providerRotation';
import {
  clampCount,
  type WebSearchFetch,
  type WebSearchProvider,
  type WebSearchProviderName,
  type WebSearchResult,
} from './providerUtils';
import { braveProvider } from './providers/brave';
import { duckDuckGoProvider } from './providers/duckDuckGo';
import { tavilyProvider } from './providers/tavily';
import { COOLDOWN_KINDS, classifyError, type WebSearchErrorKind } from './webSearchError';

export const MAX_QUERY_CHARS = 240;

export type WebSearchTried = {
  provider: WebSearchProviderName;
  error?: WebSearchErrorKind;
  skipped?: 'unconfigured' | 'cooldown' | 'empty_results';
};

export type WebSearchOutcome = {
  query: string;
  count: number;
  results: WebSearchResult[];
  answer?: string;
  provider: WebSearchProviderName | null;
  tried: WebSearchTried[];
  tookMs: number;
  cached?: true;
  /** Shared another caller's in-flight search (no provider call of its own). */
  joined?: true;
  /** Every provider failed (not a genuine "no results"). */
  exhausted?: boolean;
  disabled?: true;
  /** `admit` refused (global limit); nothing was sent. */
  rateLimited?: true;
  error?: 'empty_query';
};

export type WebSearchOptions = {
  count?: number;
  /** Run cancellation: aborts the chain; never cools a provider. */
  signal?: AbortSignal;
  /** Called once right before any provider call (after cache + single-flight). */
  admit?: () => Promise<boolean>;
};

export type WebSearchProviderStatus = ProviderHealthState & {
  name: WebSearchProviderName;
  configured: boolean;
  healthy: boolean;
};

export type WebSearchChainDeps = {
  env?: () => AgentWebEnvConfig;
  fetchImpl?: WebSearchFetch;
  now?: () => number;
  providers?: Partial<Record<WebSearchProviderName, WebSearchProvider>>;
  log?: (message: string) => void;
};

const DEFAULT_PROVIDERS: Record<WebSearchProviderName, WebSearchProvider> = {
  tavily: tavilyProvider,
  brave: braveProvider,
  duckduckgo: duckDuckGoProvider,
};

export function cleanSearchQuery(query: unknown): string {
  return String(query ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, MAX_QUERY_CHARS)
    .trim();
}

function deadlineSignal(totalMs: number, external?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(totalMs);
  return external ? AbortSignal.any([timeout, external]) : timeout;
}

export function createWebSearchChain(deps: WebSearchChainDeps = {}) {
  const env = deps.env ?? agentWebEnv;
  const now = deps.now ?? Date.now;
  const fetchImpl: WebSearchFetch = deps.fetchImpl ?? ((url, init) => fetch(url, init));
  const providers = { ...DEFAULT_PROVIDERS, ...(deps.providers ?? {}) };
  const log = deps.log ?? ((message: string) => console.warn(message));
  const health = new ProviderHealthTracker(now);
  const rotation = new ProviderRotation();
  const cache = new TtlCache<WebSearchOutcome>({
    ttlMs: () => env().searchCacheTtlMs,
    max: () => env().searchCacheMax,
    now,
  });

  /** Keyed candidates in rotation order, then the keyless fallback when enabled. */
  function chainOrder(config: AgentWebEnvConfig): WebSearchProviderName[] {
    const keyed = config.providerOrder.filter(
      (name): name is WebSearchProviderName => name === 'tavily' || name === 'brave',
    );
    const ordered = rotation.order(keyed, config.rotation, (name) => health.isHealthy(name)) as WebSearchProviderName[];
    return config.ddgEnabled ? [...ordered, 'duckduckgo'] : ordered;
  }

  function isConfigured(): boolean {
    return isAgentWebSearchOn(env());
  }

  function status(): WebSearchProviderStatus[] {
    const config = env();
    const names: WebSearchProviderName[] = [...config.providerOrder, ...(config.ddgEnabled ? ['duckduckgo'] : [])] as WebSearchProviderName[];
    return names.map((name) => ({
      name,
      configured: providers[name]?.isConfigured(config) ?? false,
      healthy: health.isHealthy(name),
      ...health.snapshot(name),
    }));
  }

  async function runChain(query: string, count: number, signal?: AbortSignal): Promise<WebSearchOutcome> {
    const config = env();
    const start = now();
    const deadline = deadlineSignal(config.searchTotalTimeoutMs, signal);
    const tried: WebSearchTried[] = [];
    let sawEmpty = false;
    for (const name of chainOrder(config)) {
      if (signal?.aborted) break;
      const provider = providers[name];
      if (!provider || !provider.isConfigured(config)) {
        tried.push({ provider: name, skipped: 'unconfigured' });
        continue;
      }
      if (!health.isHealthy(name)) {
        tried.push({ provider: name, skipped: 'cooldown' });
        continue;
      }
      rotation.markAttempt(name);
      try {
        const res = await provider.search({ query, count, fetchImpl, signal: deadline, env: config });
        health.recordSuccess(name);
        if (!res.results.length) {
          // Healthy but empty: rotate. A miss on one index must not hide hits on the other.
          sawEmpty = true;
          tried.push({ provider: name, skipped: 'empty_results' });
          continue;
        }
        return {
          query,
          count: res.results.length,
          results: res.results,
          ...(res.answer ? { answer: res.answer } : {}),
          provider: name,
          tried,
          tookMs: now() - start,
        };
      } catch (err) {
        if (signal?.aborted) break; // the run was cancelled: not the provider's fault
        const classified = classifyError(err);
        if (COOLDOWN_KINDS.has(classified.kind)) health.recordFailure(name, classified);
        // Kind only: the trail reaches the UI and the chat history, a raw message never does.
        log(`[agent-web] provider ${name} failed (${classified.kind})`);
        tried.push({ provider: name, error: classified.kind });
      }
    }
    return { query, count: 0, results: [], provider: null, exhausted: !sawEmpty, tried, tookMs: now() - start };
  }

  async function search(rawQuery: unknown, opts: WebSearchOptions = {}): Promise<WebSearchOutcome> {
    const query = cleanSearchQuery(rawQuery);
    if (!query) return { query: '', count: 0, results: [], provider: null, tried: [], error: 'empty_query', tookMs: 0 };
    if (!isConfigured()) return { query, count: 0, results: [], provider: null, tried: [], disabled: true, tookMs: 0 };

    const count = clampCount(opts.count);
    const key = `${query.toLowerCase()}#${count}`;
    const hit = cache.get(key);
    if (hit) return { ...hit, cached: true };

    // `admit` is the global limit, the same for every caller, so a joined caller may share
    // a refusal as well as a result.
    const flight = cache.singleFlight<WebSearchOutcome>(key, async () => {
      if (opts.admit && !(await opts.admit())) {
        return { query, count: 0, results: [], provider: null, tried: [], rateLimited: true, tookMs: 0 };
      }
      const outcome = await runChain(query, count, opts.signal);
      if (outcome.provider && outcome.results.length) cache.set(key, outcome);
      return outcome;
    });
    const outcome = await flight.promise;
    return flight.joined ? { ...outcome, joined: true } : outcome;
  }

  function reset(): void {
    cache.clear();
    health.clear();
    rotation.clear();
  }

  return { search, isConfigured, status, reset, health };
}

export type WebSearchChain = ReturnType<typeof createWebSearchChain>;

let singleton: WebSearchChain | null = null;

function chain(): WebSearchChain {
  if (!singleton) singleton = createWebSearchChain();
  return singleton;
}

export function searchWeb(query: unknown, opts?: WebSearchOptions): Promise<WebSearchOutcome> {
  return chain().search(query, opts);
}

export function isWebSearchConfigured(): boolean {
  return chain().isConfigured();
}

export function getWebSearchProviderStatus(): WebSearchProviderStatus[] {
  return chain().status();
}

export function resetWebSearchState(): void {
  chain().reset();
}
