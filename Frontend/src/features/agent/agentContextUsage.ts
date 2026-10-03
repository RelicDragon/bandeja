import {
  AGENT_CONTEXT_CRITICAL_RATIO,
  AGENT_CONTEXT_WARN_RATIO,
  type AgentChatUsageDto,
} from '@shared/agentContract';

export type AgentContextLevel = 'ok' | 'warn' | 'critical';

export function agentContextRatio(usage: AgentChatUsageDto): number {
  if (usage.contextWindowTokens <= 0) return 0;
  return Math.min(1, Math.max(0, usage.contextTokens / usage.contextWindowTokens));
}

/** warn (≥50%) shows the "start a new chat" hint; critical (≥75%) turns it red. */
export function agentContextLevel(ratio: number): AgentContextLevel {
  if (ratio >= AGENT_CONTEXT_CRITICAL_RATIO) return 'critical';
  if (ratio >= AGENT_CONTEXT_WARN_RATIO) return 'warn';
  return 'ok';
}
