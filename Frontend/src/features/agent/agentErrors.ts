import type { AgentErrorCode } from '@shared/agentContract';

const CODES: readonly AgentErrorCode[] = [
  'RATE_LIMITED',
  'BUDGET_EXCEEDED',
  'CHAT_BUSY',
  'LLM_ERROR',
  'TIMEOUT',
  'INTERNAL',
];

/** `code` from an axios `ApiError` body, when it is one of the agent codes. */
export function agentErrorCodeOf(err: unknown): AgentErrorCode | null {
  const data = (err as { response?: { data?: { code?: unknown } } } | null)?.response?.data;
  const code = data?.code;
  return typeof code === 'string' && (CODES as readonly string[]).includes(code)
    ? (code as AgentErrorCode)
    : null;
}

/**
 * i18n key under `agent.errors.*` for a code. Codes without their own line (and codes a newer
 * server sends that this build does not know, e.g. a truncated reply) get the generic one.
 */
export function agentErrorKey(code: AgentErrorCode | string | null | undefined): string {
  return code && (CODES as readonly string[]).includes(code) ? `agent.errors.${code}` : 'agent.errors.INTERNAL';
}

/** Daily budget / rate limit: the composer pauses until the reset (`retryAt`). */
export type AgentLimitCode = Extract<AgentErrorCode, 'RATE_LIMITED' | 'BUDGET_EXCEEDED'>;

export function isAgentLimitCode(code: AgentErrorCode | null | undefined): code is AgentLimitCode {
  return code === 'RATE_LIMITED' || code === 'BUDGET_EXCEEDED';
}

function validIso(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/**
 * When an agent limit lifts (ISO): the 429 body's `retryAt`, else the `Retry-After` header
 * (seconds, or an HTTP date), else, for BUDGET_EXCEEDED, the chat usage's `dailyResetsAt`.
 * Servers that predate `retryAt` still give the header; null when nothing says.
 */
export function agentErrorRetryAt(
  err: unknown,
  opts: { dailyResetsAt?: string | null; now?: number } = {},
): string | null {
  const response = (err as { response?: { data?: { retryAt?: unknown }; headers?: Record<string, unknown> } } | null)
    ?.response;
  const fromBody = validIso(response?.data?.retryAt);
  if (fromBody) return fromBody;
  const header = response?.headers?.['retry-after'] ?? response?.headers?.['Retry-After'];
  if ((typeof header === 'string' && header.trim() !== '') || typeof header === 'number') {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return new Date((opts.now ?? Date.now()) + seconds * 1000).toISOString();
    }
    const date = validIso(String(header));
    if (date) return date;
  }
  return agentErrorCodeOf(err) === 'BUDGET_EXCEEDED' ? validIso(opts.dailyResetsAt) : null;
}

/** Same fallback for a `run.failed` event (its own `retryAt`, else the budget reset). */
export function agentRunFailureRetryAt(
  code: AgentErrorCode,
  retryAt: string | null | undefined,
  dailyResetsAt: string | null | undefined,
): string | null {
  return validIso(retryAt) ?? (code === 'BUDGET_EXCEEDED' ? validIso(dailyResetsAt) : null);
}
