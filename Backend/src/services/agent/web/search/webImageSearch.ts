/**
 * Image search for `web_images`: Tavily (`include_images`) and Brave Images, in the
 * configured provider order with plain failover. Smaller than the web search chain on
 * purpose: no rotation or circuit breaker, a cache + single-flight and the `admit` hook
 * (global limit, checked only on a miss). Never throws: failures come back as flags.
 *
 * Only https image URLs survive (the image proxy refuses anything else). Results carry no
 * page text, only a short description / title.
 */
import { agentWebEnv, isAgentWebSearchOn, type AgentWebEnvConfig } from '../../../../config/agentWebEnv';
import { canonicalizeUrl, safeHttpUrl } from '../webUrl';
import { TtlCache } from '../webTtlCache';
import { clipText, timeoutSignal, type WebSearchFetch } from './providerUtils';
import { classifyError, classifyHttpError, networkError, WebSearchError, type WebSearchErrorKind } from './webSearchError';
import { cleanSearchQuery } from './webSearchChain';
import { TAVILY_ENDPOINT } from './providers/tavily';

export const BRAVE_IMAGES_ENDPOINT = 'https://api.search.brave.com/res/v1/images/search';
export const IMAGE_COUNT_MIN = 1;
export const IMAGE_COUNT_MAX = 6;
export const IMAGE_COUNT_DEFAULT = 4;
const IMAGE_ALT_MAX_CHARS = 160;

export type WebImageProviderName = 'tavily' | 'brave';

export type WebImageResult = {
  /** https image URL. */
  url: string;
  /** Page the image is on, when the provider says. */
  pageUrl: string | null;
  alt: string;
  width: number | null;
  height: number | null;
};

export type WebImageSearchOutcome = {
  query: string;
  images: WebImageResult[];
  provider: WebImageProviderName | null;
  tried: { provider: WebImageProviderName; error?: WebSearchErrorKind; skipped?: 'unconfigured' | 'empty_results' }[];
  cached?: true;
  joined?: true;
  /** Every provider failed (not a genuine "no images"). */
  exhausted?: boolean;
  disabled?: true;
  rateLimited?: true;
  error?: 'empty_query';
};

export type WebImageSearchOptions = {
  count?: number;
  signal?: AbortSignal;
  admit?: () => Promise<boolean>;
};

export function clampImageCount(count: unknown): number {
  const n = Number(count);
  if (count == null || !Number.isFinite(n)) return IMAGE_COUNT_DEFAULT;
  return Math.max(IMAGE_COUNT_MIN, Math.min(IMAGE_COUNT_MAX, Math.trunc(n)));
}

function httpsUrl(value: unknown): string | null {
  const url = safeHttpUrl(value);
  return url && url.protocol === 'https:' ? url.href : null;
}

function positiveInt(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** De-duplicates by canonical image URL and caps the list. */
export function normalizeImages(raw: readonly (WebImageResult | null)[], count: number): WebImageResult[] {
  const out: WebImageResult[] = [];
  const seen = new Set<string>();
  for (const image of raw) {
    if (!image || out.length >= count) continue;
    const key = canonicalizeUrl(image.url) ?? image.url;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(image);
  }
  return out;
}

type ImageProviderArgs = { query: string; count: number; fetchImpl: WebSearchFetch; signal: AbortSignal; env: AgentWebEnvConfig };

type ImageProvider = {
  isConfigured(env: AgentWebEnvConfig): boolean;
  search(args: ImageProviderArgs): Promise<WebImageResult[]>;
};

async function readJson<T>(response: Response, provider: WebImageProviderName, label: string): Promise<T> {
  if (!response.ok) {
    const { kind, retryAfterMs } = classifyHttpError(response.status, response.headers);
    throw new WebSearchError(`${label} error (${response.status})`, { kind, retryAfterMs, status: response.status, provider });
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new WebSearchError(`${label} returned non-JSON`, { kind: 'unknown', provider });
  }
}

const tavilyImages: ImageProvider = {
  isConfigured: (env) => Boolean(env.tavilyApiKey),
  async search({ query, count, fetchImpl, signal, env }) {
    let response: Response;
    try {
      response = await fetchImpl(TAVILY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${env.tavilyApiKey}` },
        body: JSON.stringify({
          query,
          max_results: 1,
          search_depth: 'basic',
          include_images: true,
          include_image_descriptions: true,
        }),
        signal: timeoutSignal(env.searchTimeoutMs, signal),
      });
    } catch (err) {
      throw networkError('tavily', err);
    }
    const body = await readJson<{ images?: unknown }>(response, 'tavily', 'Tavily API');
    const raw = Array.isArray(body?.images) ? body.images : [];
    // Plain URL strings without descriptions, objects `{ url, description }` with them.
    const images = raw.map((item): WebImageResult | null => {
      const entry = typeof item === 'string' ? { url: item } : (item as { url?: unknown; description?: unknown } | null);
      const url = httpsUrl(entry?.url);
      if (!url) return null;
      return { url, pageUrl: null, alt: clipText(entry?.description, IMAGE_ALT_MAX_CHARS), width: null, height: null };
    });
    return normalizeImages(images, count);
  },
};

const braveImages: ImageProvider = {
  isConfigured: (env) => Boolean(env.braveApiKey),
  async search({ query, count, fetchImpl, signal, env }) {
    const url = new URL(BRAVE_IMAGES_ENDPOINT);
    url.searchParams.set('q', query);
    url.searchParams.set('count', String(Math.min(20, count * 2)));
    url.searchParams.set('safesearch', 'strict');
    let response: Response;
    try {
      response = await fetchImpl(url.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json', 'X-Subscription-Token': env.braveApiKey },
        signal: timeoutSignal(env.searchTimeoutMs, signal),
      });
    } catch (err) {
      throw networkError('brave', err);
    }
    const body = await readJson<{ results?: unknown }>(response, 'brave', 'Brave Images API');
    const raw = Array.isArray(body?.results) ? body.results : [];
    const images = raw.map((item): WebImageResult | null => {
      const r = item as {
        title?: unknown;
        url?: unknown;
        properties?: { url?: unknown; width?: unknown; height?: unknown };
      } | null;
      const image = httpsUrl(r?.properties?.url);
      if (!image) return null;
      const page = safeHttpUrl(r?.url);
      return {
        url: image,
        pageUrl: page ? page.href : null,
        alt: clipText(r?.title, IMAGE_ALT_MAX_CHARS),
        width: positiveInt(r?.properties?.width),
        height: positiveInt(r?.properties?.height),
      };
    });
    return normalizeImages(images, count);
  },
};

const PROVIDERS: Record<WebImageProviderName, ImageProvider> = { tavily: tavilyImages, brave: braveImages };

export type WebImageSearchDeps = {
  env?: () => AgentWebEnvConfig;
  fetchImpl?: WebSearchFetch;
  now?: () => number;
  log?: (message: string) => void;
};

export function createWebImageSearch(deps: WebImageSearchDeps = {}) {
  const env = deps.env ?? agentWebEnv;
  const now = deps.now ?? Date.now;
  const fetchImpl: WebSearchFetch = deps.fetchImpl ?? ((url, init) => fetch(url, init));
  const log = deps.log ?? ((message: string) => console.warn(message));
  const cache = new TtlCache<WebImageSearchOutcome>({
    ttlMs: () => env().searchCacheTtlMs,
    max: () => env().searchCacheMax,
    now,
  });

  async function runChain(query: string, count: number, signal?: AbortSignal): Promise<WebImageSearchOutcome> {
    const config = env();
    const deadline = AbortSignal.any([AbortSignal.timeout(config.searchTotalTimeoutMs), ...(signal ? [signal] : [])]);
    const tried: WebImageSearchOutcome['tried'] = [];
    let sawEmpty = false;
    const order = config.providerOrder.filter((name): name is WebImageProviderName => name === 'tavily' || name === 'brave');
    for (const name of order) {
      if (signal?.aborted) break;
      const provider = PROVIDERS[name];
      if (!provider.isConfigured(config)) {
        tried.push({ provider: name, skipped: 'unconfigured' });
        continue;
      }
      try {
        const images = await provider.search({ query, count, fetchImpl, signal: deadline, env: config });
        if (!images.length) {
          sawEmpty = true;
          tried.push({ provider: name, skipped: 'empty_results' });
          continue;
        }
        return { query, images, provider: name, tried };
      } catch (err) {
        if (signal?.aborted) break;
        const classified = classifyError(err);
        log(`[agent-web] image provider ${name} failed (${classified.kind})`);
        tried.push({ provider: name, error: classified.kind });
      }
    }
    return { query, images: [], provider: null, tried, exhausted: !sawEmpty };
  }

  async function search(rawQuery: unknown, opts: WebImageSearchOptions = {}): Promise<WebImageSearchOutcome> {
    const query = cleanSearchQuery(rawQuery);
    if (!query) return { query: '', images: [], provider: null, tried: [], error: 'empty_query' };
    if (!isAgentWebSearchOn(env())) return { query, images: [], provider: null, tried: [], disabled: true };
    const count = clampImageCount(opts.count);
    const key = `img#${query.toLowerCase()}#${count}`;
    const hit = cache.get(key);
    if (hit) return { ...hit, cached: true };
    const flight = cache.singleFlight<WebImageSearchOutcome>(key, async () => {
      if (opts.admit && !(await opts.admit())) return { query, images: [], provider: null, tried: [], rateLimited: true };
      const outcome = await runChain(query, count, opts.signal);
      if (outcome.provider && outcome.images.length) cache.set(key, outcome);
      return outcome;
    });
    const outcome = await flight.promise;
    return flight.joined ? { ...outcome, joined: true } : outcome;
  }

  return { search, reset: () => cache.clear() };
}

let singleton: ReturnType<typeof createWebImageSearch> | null = null;

export function searchWebImages(query: unknown, opts?: WebImageSearchOptions): Promise<WebImageSearchOutcome> {
  if (!singleton) singleton = createWebImageSearch();
  return singleton.search(query, opts);
}
