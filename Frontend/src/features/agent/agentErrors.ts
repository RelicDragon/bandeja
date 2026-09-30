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

/** i18n key under `agent.errors.*` for a code (falls back to the generic line). */
export function agentErrorKey(code: AgentErrorCode | null | undefined): string {
  return code ? `agent.errors.${code}` : 'agent.errors.INTERNAL';
}
