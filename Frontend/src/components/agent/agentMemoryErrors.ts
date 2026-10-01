import type { TFunction } from 'i18next';
import type { AgentMemoryErrorCode } from '@shared/agentContract';
import { extractApiErrorMessage } from '@/utils/extractApiErrorMessage';

const CODE_KEYS: Record<AgentMemoryErrorCode, string> = {
  MEMORY_DISABLED: 'agent.memory.errorDisabled',
  MEMORY_LIMIT: 'agent.memory.errorLimit',
  MEMORY_SENSITIVE: 'agent.memory.errorSensitive',
};

/** Localized line for a memory route error (`code` from the server), else the generic mapping. */
export function agentMemoryErrorMessage(err: unknown, t: TFunction): string {
  const code = (err as { response?: { data?: { code?: unknown } } })?.response?.data?.code;
  if (typeof code === 'string' && code in CODE_KEYS) return t(CODE_KEYS[code as AgentMemoryErrorCode]);
  return extractApiErrorMessage(err, t);
}
