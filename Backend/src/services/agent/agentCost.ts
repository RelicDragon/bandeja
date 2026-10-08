/**
 * Estimated USD cost of agent LLM usage for the admin dashboard (`GET /api/admin/agent/usage`).
 * Pure pricing over `LlmUsageLog` rows; nothing here is billed or shown to users.
 *
 * Price table: JSON object, USD per 1M tokens, `{ "<key>": { "input", "cachedInput"?, "output"? } }`.
 * A row is priced by, first match:
 *   1. its reason, for metered rows (web / voice: `inputTokens` are token-equivalent charges,
 *      `AGENT_METERED_USAGE_REASONS`), e.g. `"agent_web_search": { "input": 8 }`;
 *   2. its model, exact (`"deepseek-flash"`);
 *   3. the longest matching prefix key ending in `*` (`"deepseek-*"`).
 * `cachedInput` defaults to `input`, `output` to `input`. Unpriced rows cost null (listed as such).
 *
 * Source: `AGENT_PRICES_USD_PER_MTOK` PlatformSetting row, else the env of the same name, else
 * {@link AGENT_DEFAULT_PRICES} (rough list-price estimates; set the real ones in Admin).
 */

export type AgentPrice = { input: number; cachedInput?: number; output?: number };
export type AgentPriceTable = Record<string, AgentPrice>;
export type AgentPriceSource = 'setting' | 'env' | 'default';

/**
 * Estimates (2026-10). DeepSeek chat models: miss 0.28 / hit 0.028 / out 0.42 per 1M. Metered
 * rows at the default charges: web search 1000 equiv. ≈ $0.008 per live search, fetch 300 ≈
 * $0.0015. Voice is charged at one rate, $15 per 1M equiv. (`AGENT_VOICE_TOKENS_PER_USD`):
 * speech 1 / char ≈ $0.015 per 1000 chars (gpt-4o-mini-tts); transcription, batch or realtime,
 * per started second at the model's price (`agentVoiceSttTokensPerSecond`): gpt-transcribe
 * 5 / s ≈ $0.0045 per minute, gpt-live-transcribe 19 / s ≈ $0.017, gpt-4o-transcribe 7 / s
 * ≈ $0.006, gpt-4o-mini-transcribe 3 / s ≈ $0.003. With `AGENT_VOICE_STT_TOKENS_PER_SECOND` set
 * the transcription prices here no longer match; set them in the table.
 */
export const AGENT_DEFAULT_PRICES: AgentPriceTable = {
  'deepseek-*': { input: 0.28, cachedInput: 0.028, output: 0.42 },
  agent_web_search: { input: 8 },
  agent_web_fetch: { input: 5 },
  agent_voice_transcription: { input: 15 },
  agent_voice_speech: { input: 15 },
  agent_voice_realtime_transcription: { input: 15 },
};

function price(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** Valid entries of a raw JSON table; null when the JSON or every entry is invalid. */
export function parseAgentPriceTable(raw: string | null | undefined): AgentPriceTable | null {
  if (!raw || !raw.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const table: AgentPriceTable = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!key.trim() || !value || typeof value !== 'object') continue;
    const entry = value as Record<string, unknown>;
    const input = price(entry.input);
    if (input == null) continue;
    table[key.trim()] = {
      input,
      ...(price(entry.cachedInput) != null ? { cachedInput: price(entry.cachedInput) } : {}),
      ...(price(entry.output) != null ? { output: price(entry.output) } : {}),
    };
  }
  return Object.keys(table).length ? table : null;
}

export function resolveAgentPriceTable(settingRaw: string | null, envRaw: string | null): {
  source: AgentPriceSource;
  table: AgentPriceTable;
} {
  const fromSetting = parseAgentPriceTable(settingRaw);
  if (fromSetting) return { source: 'setting', table: fromSetting };
  const fromEnv = parseAgentPriceTable(envRaw);
  if (fromEnv) return { source: 'env', table: fromEnv };
  return { source: 'default', table: AGENT_DEFAULT_PRICES };
}

export function agentPriceFor(
  table: AgentPriceTable,
  row: { model: string; reason: string | null },
  meteredReasons: readonly string[],
): AgentPrice | null {
  if (row.reason && meteredReasons.includes(row.reason)) return table[row.reason] ?? null;
  if (table[row.model]) return table[row.model];
  let best: { length: number; price: AgentPrice } | null = null;
  for (const [key, value] of Object.entries(table)) {
    if (!key.endsWith('*')) continue;
    const prefix = key.slice(0, -1);
    if (row.model.startsWith(prefix) && (!best || prefix.length > best.length)) best = { length: prefix.length, price: value };
  }
  return best?.price ?? null;
}

/** USD for one row / sum; null when unpriced. `cachedInputTokens` is part of `inputTokens`. */
export function agentCostUsd(
  usage: { inputTokens: number; cachedInputTokens: number; outputTokens: number },
  p: AgentPrice | null,
): number | null {
  if (!p) return null;
  const cached = Math.min(usage.inputTokens, Math.max(0, usage.cachedInputTokens));
  const miss = usage.inputTokens - cached;
  return (miss * p.input + cached * (p.cachedInput ?? p.input) + usage.outputTokens * (p.output ?? p.input)) / 1_000_000;
}

/** Rounded for the JSON response (sub-cent precision matters at these prices). */
export function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
