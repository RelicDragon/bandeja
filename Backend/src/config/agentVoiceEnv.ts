/**
 * Agent voice env (docs/domains/agent.md § Voice). Read live from `process.env` through
 * `config.agentVoice`, so tests and a pm2 restart flip it without a rebuild. Uses
 * `OPENAI_API_KEY` (the same key as voice-message transcription); no key = voice off (503).
 */

export type AgentVoiceEnvConfig = {
  /** Kill switch for both routes. */
  enabled: boolean;
  /** Speech-to-text model (`audio.transcriptions`). */
  sttModel: string;
  /** Text-to-speech model (`audio.speech`). */
  ttsModel: string;
  ttsVoice: string;
  /** Style instructions for models that take them (gpt-4o-mini-tts). */
  ttsInstructions: string;
  /** Token-equivalents charged to `AGENT_DAILY_TOKEN_BUDGET` per started second of audio. */
  sttTokensPerSecond: number;
  /** Token-equivalents charged per spoken character. */
  ttsTokensPerChar: number;
  /** Transcriptions per user per window. */
  sttRateLimitMax: number;
  /** Speech requests per user per window (one per sentence). */
  ttsRateLimitMax: number;
  rateLimitWindowMs: number;
  /** Outbound provider request timeout. */
  timeoutMs: number;
};

export const AGENT_VOICE_DEFAULT_STT_MODEL = 'gpt-4o-mini-transcribe';
export const AGENT_VOICE_DEFAULT_TTS_MODEL = 'gpt-4o-mini-tts';
export const AGENT_VOICE_DEFAULT_TTS_VOICE = 'coral';
export const AGENT_VOICE_DEFAULT_TTS_INSTRUCTIONS =
  'Friendly, upbeat sports-club assistant. Speak naturally and a little brisk, like a helpful friend on the phone. Read times and dates the way people say them aloud.';

function intInRange(raw: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export function resolveAgentVoiceEnvConfig(env: NodeJS.ProcessEnv): AgentVoiceEnvConfig {
  return {
    enabled: (env.AGENT_VOICE_ENABLED ?? '').trim().toLowerCase() !== 'false',
    sttModel: (env.AGENT_VOICE_STT_MODEL || '').trim() || AGENT_VOICE_DEFAULT_STT_MODEL,
    ttsModel: (env.AGENT_VOICE_TTS_MODEL || '').trim() || AGENT_VOICE_DEFAULT_TTS_MODEL,
    ttsVoice: (env.AGENT_VOICE_TTS_VOICE || '').trim() || AGENT_VOICE_DEFAULT_TTS_VOICE,
    ttsInstructions: (env.AGENT_VOICE_TTS_INSTRUCTIONS || '').trim() || AGENT_VOICE_DEFAULT_TTS_INSTRUCTIONS,
    sttTokensPerSecond: intInRange(env.AGENT_VOICE_STT_TOKENS_PER_SECOND, 20, 0, 100_000),
    ttsTokensPerChar: intInRange(env.AGENT_VOICE_TTS_TOKENS_PER_CHAR, 1, 0, 1_000),
    sttRateLimitMax: intInRange(env.AGENT_VOICE_STT_RATE_LIMIT_MAX, 60, 1, 10_000),
    ttsRateLimitMax: intInRange(env.AGENT_VOICE_TTS_RATE_LIMIT_MAX, 400, 1, 100_000),
    rateLimitWindowMs: intInRange(env.AGENT_VOICE_RATE_LIMIT_WINDOW_MS, 10 * 60 * 1000, 1000, 24 * 60 * 60 * 1000),
    timeoutMs: intInRange(env.AGENT_VOICE_TIMEOUT_MS, 20_000, 2_000, 120_000),
  };
}
