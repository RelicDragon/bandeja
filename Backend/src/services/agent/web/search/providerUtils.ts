/**
 * Helpers shared by the search provider adapters (port of travel-bandeja
 * `providerUtils.js`). Adds a title cap and
 * de-duplication by canonical URL.
 */
import type { AgentWebEnvConfig } from '../../../../config/agentWebEnv';
import { canonicalizeUrl } from '../webUrl';

export const MIN_COUNT = 1;
export const MAX_COUNT = 8;
export const DEFAULT_COUNT = 5;
export const MAX_SNIPPET_CHARS = 320;
export const MAX_TITLE_CHARS = 160;
export const MAX_ANSWER_CHARS = 600;

export const SEARCH_USER_AGENT = 'BandejaAgent/1.0 (+https://bandeja.me)';

export type WebSearchProviderName = 'tavily' | 'brave' | 'duckduckgo';

export type WebSearchResult = { title: string; url: string; snippet: string };

export type WebSearchFetch = (url: string, init?: RequestInit) => Promise<Response>;

export type WebSearchProviderArgs = {
  query: string;
  count: number;
  fetchImpl: WebSearchFetch;
  signal?: AbortSignal;
  env: AgentWebEnvConfig;
};

export interface WebSearchProvider {
  name: WebSearchProviderName;
  /** false only for the keyless DuckDuckGo fallback. */
  keyed: boolean;
  isConfigured(env: AgentWebEnvConfig): boolean;
  search(args: WebSearchProviderArgs): Promise<{ results: WebSearchResult[]; answer?: string }>;
}

export function clampCount(count: unknown): number {
  const n = Number(count);
  if (count == null || !Number.isFinite(n)) return DEFAULT_COUNT;
  return Math.max(MIN_COUNT, Math.min(MAX_COUNT, Math.trunc(n)));
}

export function clipText(text: unknown, max: number): string {
  if (text == null) return '';
  const clean = String(text).replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

export function trimSnippet(text: unknown): string {
  return clipText(text, MAX_SNIPPET_CHARS);
}

type RawResult = {
  title?: unknown;
  url?: unknown;
  link?: unknown;
  snippet?: unknown;
  description?: unknown;
  content?: unknown;
};

/** Canonical `{title, url, snippet}`; null without an http(s) URL. */
export function normalizeResult(raw: unknown): WebSearchResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as RawResult;
  const url = String(r.url ?? r.link ?? '').trim();
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try {
    new URL(url);
  } catch {
    return null;
  }
  return {
    title: clipText(r.title, MAX_TITLE_CHARS) || clipText(url, MAX_TITLE_CHARS),
    url,
    snippet: trimSnippet(r.snippet ?? r.description ?? r.content ?? ''),
  };
}

export function normalizeResults(raws: unknown, count: number): WebSearchResult[] {
  if (!Array.isArray(raws)) return [];
  const out: WebSearchResult[] = [];
  const seen = new Set<string>();
  for (const raw of raws) {
    if (out.length >= count) break;
    const result = normalizeResult(raw);
    if (!result) continue;
    const key = canonicalizeUrl(result.url) ?? result.url;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(result);
  }
  return out;
}

/** Per-attempt timeout combined with the chain / run signal. */
export function timeoutSignal(timeoutMs: number, external?: AbortSignal): AbortSignal {
  const ms = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 8_000;
  const timeout = AbortSignal.timeout(ms);
  return external ? AbortSignal.any([timeout, external]) : timeout;
}
