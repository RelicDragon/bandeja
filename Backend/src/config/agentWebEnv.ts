/**
 * Agent web search / web fetch env (docs/plans/ai-agent-web-search.md §13.12). Read live
 * from `process.env` on every call, so tests and a pm2 restart flip it without a rebuild.
 * Key values are only ever compared with '' here; nothing logs them.
 */

export type AgentWebRotation = 'lru' | 'ordered';

export type AgentWebEnvConfig = {
  /** Kill switch: false hides both web tools and the prompt rule. */
  enabled: boolean;
  /** false hides only `web_fetch`. */
  fetchEnabled: boolean;
  tavilyApiKey: string;
  braveApiKey: string;
  /** Candidate order (keyed providers only; duckduckgo is appended last when enabled). */
  providerOrder: string[];
  rotation: AgentWebRotation;
  ddgEnabled: boolean;
  searchTimeoutMs: number;
  searchTotalTimeoutMs: number;
  searchCacheTtlMs: number;
  searchCacheMax: number;
  searchPerRun: number;
  searchPerUserDay: number;
  searchGlobalPerMin: number;
  searchTokenCost: number;
  fetchTimeoutMs: number;
  fetchMaxBytes: number;
  fetchMaxChars: number;
  fetchCacheTtlMs: number;
  fetchCacheMax: number;
  fetchPerRun: number;
  fetchPerUserDay: number;
  fetchGlobalPerMin: number;
  fetchTokenCost: number;
};

/** Hard ceiling of `web_fetch` text, whatever the env or the model asks. */
export const AGENT_WEB_FETCH_HARD_MAX_CHARS = 12_000;
export const AGENT_WEB_DEFAULT_PROVIDER_ORDER = ['tavily', 'brave'];

function intInRange(raw: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function flag(raw: string | undefined, fallback: boolean): boolean {
  const value = (raw ?? '').trim().toLowerCase();
  if (!value) return fallback;
  if (['false', '0', 'off', 'no'].includes(value)) return false;
  if (['true', '1', 'on', 'yes'].includes(value)) return true;
  return fallback;
}

function providerOrder(raw: string | undefined): string[] {
  const names = (raw ?? '')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name === 'tavily' || name === 'brave');
  const unique = [...new Set(names)];
  return unique.length ? unique : [...AGENT_WEB_DEFAULT_PROVIDER_ORDER];
}

export function resolveAgentWebEnvConfig(env: NodeJS.ProcessEnv): AgentWebEnvConfig {
  return {
    enabled: flag(env.AGENT_WEB_SEARCH_ENABLED, true),
    fetchEnabled: flag(env.AGENT_WEB_FETCH_ENABLED, true),
    tavilyApiKey: (env.TAVILY_API_KEY ?? '').trim(),
    braveApiKey: (env.BRAVE_SEARCH_API_KEY ?? '').trim(),
    providerOrder: providerOrder(env.AGENT_WEB_SEARCH_PROVIDER_ORDER),
    rotation: (env.AGENT_WEB_SEARCH_ROTATION ?? '').trim().toLowerCase() === 'ordered' ? 'ordered' : 'lru',
    ddgEnabled: flag(env.AGENT_WEB_SEARCH_DDG_ENABLED, false),
    searchTimeoutMs: intInRange(env.AGENT_WEB_SEARCH_TIMEOUT_MS, 8_000, 500, 60_000),
    searchTotalTimeoutMs: intInRange(env.AGENT_WEB_SEARCH_TOTAL_TIMEOUT_MS, 15_000, 1_000, 120_000),
    searchCacheTtlMs: intInRange(env.AGENT_WEB_SEARCH_CACHE_TTL_MS, 60 * 60 * 1000, 0, 24 * 60 * 60 * 1000),
    searchCacheMax: intInRange(env.AGENT_WEB_SEARCH_CACHE_MAX, 300, 0, 10_000),
    searchPerRun: intInRange(env.AGENT_WEB_SEARCH_PER_RUN, 4, 0, 20),
    searchPerUserDay: intInRange(env.AGENT_WEB_SEARCH_PER_USER_DAY, 30, 0, 10_000),
    searchGlobalPerMin: intInRange(env.AGENT_WEB_SEARCH_GLOBAL_PER_MIN, 60, 0, 100_000),
    searchTokenCost: intInRange(env.AGENT_WEB_SEARCH_TOKEN_COST, 1000, 0, 1_000_000),
    fetchTimeoutMs: intInRange(env.AGENT_WEB_FETCH_TIMEOUT_MS, 10_000, 1_000, 60_000),
    fetchMaxBytes: intInRange(env.AGENT_WEB_FETCH_MAX_BYTES, 2 * 1024 * 1024, 16 * 1024, 10 * 1024 * 1024),
    fetchMaxChars: intInRange(env.AGENT_WEB_FETCH_MAX_CHARS, 8_000, 500, AGENT_WEB_FETCH_HARD_MAX_CHARS),
    fetchCacheTtlMs: intInRange(env.AGENT_WEB_FETCH_CACHE_TTL_MS, 15 * 60 * 1000, 0, 24 * 60 * 60 * 1000),
    fetchCacheMax: intInRange(env.AGENT_WEB_FETCH_CACHE_MAX, 200, 0, 10_000),
    fetchPerRun: intInRange(env.AGENT_WEB_FETCH_PER_RUN, 3, 0, 20),
    fetchPerUserDay: intInRange(env.AGENT_WEB_FETCH_PER_USER_DAY, 30, 0, 10_000),
    fetchGlobalPerMin: intInRange(env.AGENT_WEB_FETCH_GLOBAL_PER_MIN, 60, 0, 100_000),
    fetchTokenCost: intInRange(env.AGENT_WEB_FETCH_TOKEN_COST, 300, 0, 1_000_000),
  };
}

export function agentWebEnv(): AgentWebEnvConfig {
  return resolveAgentWebEnvConfig(process.env);
}

/** At least one keyed provider (DuckDuckGo alone never turns the feature on). */
export function hasAgentWebSearchKey(config: AgentWebEnvConfig): boolean {
  return Boolean(config.tavilyApiKey || config.braveApiKey);
}

/** The rule of §13.12: kill switch not off AND a Tavily or Brave key. */
export function isAgentWebSearchOn(config: AgentWebEnvConfig = agentWebEnv()): boolean {
  return config.enabled && hasAgentWebSearchKey(config);
}

export function isAgentWebFetchOn(config: AgentWebEnvConfig = agentWebEnv()): boolean {
  return isAgentWebSearchOn(config) && config.fetchEnabled;
}
