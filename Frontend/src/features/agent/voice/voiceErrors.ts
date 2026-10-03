import type { AgentVoiceNotice } from './agentVoiceSession';

/** API error → a specific voice notice (`agent.voice.notice.*`), or null for the generic one. */
export function voiceErrorNotice(error: unknown): AgentVoiceNotice | null {
  const code = (error as { response?: { data?: { code?: unknown } } } | null)?.response?.data?.code;
  if (code === 'VOICE_UNAVAILABLE') return 'unavailable';
  if (code === 'BUDGET_EXCEEDED') return 'budget';
  if (code === 'RATE_LIMITED') return 'rateLimited';
  return null;
}

/** These end the conversation: retrying right away can't work. */
export function isFatalVoiceNotice(notice: AgentVoiceNotice | null): boolean {
  return notice === 'unavailable' || notice === 'budget';
}
