/**
 * Agent voice env (docs/domains/agent.md § Voice). Read live from `process.env` through
 * `config.agentVoice`, so tests and a pm2 restart flip it without a rebuild. Uses
 * `OPENAI_API_KEY` (the same key as voice-message transcription); no key = voice off (503).
 */

export type AgentVoiceEnvConfig = {
  /** Kill switch for both routes. */
  enabled: boolean;
  /** Speech-to-text model (`audio.transcriptions`; v1, dictation, v2 batch fallback). */
  sttModel: string;
  /** Text-to-speech model (`audio.speech`). */
  ttsModel: string;
  ttsVoice: string;
  /** Style instructions for models that take them (gpt-4o-mini-tts). */
  ttsInstructions: string;
  /**
   * Token-equivalents charged to `AGENT_DAILY_TOKEN_BUDGET` per started second of audio, for
   * every model; null (default) = by the model's price (`agentVoiceSttTokensPerSecond`).
   */
  sttTokensPerSecond: number | null;
  /** Token-equivalents charged per spoken character. */
  ttsTokensPerChar: number;
  /** Transcriptions per user per window. */
  sttRateLimitMax: number;
  /** Speech requests per user per window (one per sentence). */
  ttsRateLimitMax: number;
  rateLimitWindowMs: number;
  /** Outbound provider request timeout. */
  timeoutMs: number;
  /** v2 realtime voice (Socket.IO `/agent-voice`). */
  realtime: AgentVoiceRealtimeEnvConfig;
};

export type AgentVoiceRealtimeTurnDetection = 'semantic_vad' | 'server_vad' | 'none';
export type AgentVoiceRealtimeEagerness = 'low' | 'medium' | 'high' | 'auto';
export type AgentVoiceRealtimeSttDelay = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

/** v2: streaming transcription → voice run → server-side streaming speech over one socket. */
export type AgentVoiceRealtimeEnvConfig = {
  /** `AGENT_VOICE_REALTIME_ENABLED` (default on; voice itself must be on and OpenAI configured). */
  enabled: boolean;
  /** Streaming transcription model (OpenAI Realtime transcription session). */
  sttModel: string;
  /** Realtime transcription WebSocket URL. */
  sttUrl: string;
  /**
   * End-of-turn detection: the provider's `semantic_vad` / `server_vad`, or `none` (a server-side
   * energy VAD commits each turn). Models without VAD (`gpt-live-transcribe`) always get `none`.
   */
  turnDetection: AgentVoiceRealtimeTurnDetection;
  /** Latency / accuracy trade-off of streaming models (`gpt-live-transcribe`); not sent to others. */
  sttDelay: AgentVoiceRealtimeSttDelay;
  /** `semantic_vad` eagerness (`high` ends turns sooner). */
  vadEagerness: AgentVoiceRealtimeEagerness;
  /** `server_vad` / energy VAD: silence that ends a turn. */
  silenceMs: number;
  /** One session's hard cap. */
  maxSessionMs: number;
  /** Listening this long without speech ends the session (`reason: 'idle'`). */
  idleMs: number;
  /** Nothing spoken this long after the end of the turn and a tool starts: one short filler. */
  fillerDelayMs: number;
  /** `voice:start` per user per `AGENT_VOICE_RATE_LIMIT_WINDOW_MS`. */
  startRateLimitMax: number;
  /**
   * A dropped socket keeps its session this long (STT paused); a `voice:start` with
   * `resumeSessionId` within it resumes it. After it: `reason: 'disconnected'`. 0 = end at once.
   */
  resumeGraceMs: number;
};

export const AGENT_VOICE_DEFAULT_REALTIME_STT_MODEL = 'gpt-transcribe';
export const AGENT_VOICE_DEFAULT_REALTIME_STT_URL = 'wss://api.openai.com/v1/realtime?intent=transcription';

export const AGENT_VOICE_DEFAULT_STT_MODEL = 'gpt-transcribe';
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
    sttTokensPerSecond: Number.isFinite(Number.parseInt(env.AGENT_VOICE_STT_TOKENS_PER_SECOND ?? '', 10))
      ? intInRange(env.AGENT_VOICE_STT_TOKENS_PER_SECOND, 0, 0, 100_000)
      : null,
    ttsTokensPerChar: intInRange(env.AGENT_VOICE_TTS_TOKENS_PER_CHAR, 1, 0, 1_000),
    sttRateLimitMax: intInRange(env.AGENT_VOICE_STT_RATE_LIMIT_MAX, 60, 1, 10_000),
    ttsRateLimitMax: intInRange(env.AGENT_VOICE_TTS_RATE_LIMIT_MAX, 400, 1, 100_000),
    rateLimitWindowMs: intInRange(env.AGENT_VOICE_RATE_LIMIT_WINDOW_MS, 10 * 60 * 1000, 1000, 24 * 60 * 60 * 1000),
    timeoutMs: intInRange(env.AGENT_VOICE_TIMEOUT_MS, 20_000, 2_000, 120_000),
    realtime: resolveAgentVoiceRealtimeEnvConfig(env),
  };
}

function oneOf<T extends string>(raw: string | undefined, allowed: readonly T[], fallback: T): T {
  const value = (raw ?? '').trim().toLowerCase();
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function resolveAgentVoiceRealtimeEnvConfig(env: NodeJS.ProcessEnv): AgentVoiceRealtimeEnvConfig {
  return {
    enabled: (env.AGENT_VOICE_REALTIME_ENABLED ?? '').trim().toLowerCase() !== 'false',
    sttModel: (env.AGENT_VOICE_REALTIME_STT_MODEL || '').trim() || AGENT_VOICE_DEFAULT_REALTIME_STT_MODEL,
    sttUrl: (env.AGENT_VOICE_REALTIME_STT_URL || '').trim() || AGENT_VOICE_DEFAULT_REALTIME_STT_URL,
    turnDetection: oneOf(env.AGENT_VOICE_REALTIME_TURN_DETECTION, ['semantic_vad', 'server_vad', 'none'] as const, 'semantic_vad'),
    vadEagerness: oneOf(env.AGENT_VOICE_REALTIME_VAD_EAGERNESS, ['low', 'medium', 'high', 'auto'] as const, 'high'),
    sttDelay: oneOf(env.AGENT_VOICE_REALTIME_STT_DELAY, ['minimal', 'low', 'medium', 'high', 'xhigh'] as const, 'low'),
    silenceMs: intInRange(env.AGENT_VOICE_REALTIME_SILENCE_MS, 550, 200, 3_000),
    maxSessionMs: intInRange(env.AGENT_VOICE_REALTIME_MAX_SESSION_MS, 30 * 60 * 1000, 60_000, 4 * 60 * 60 * 1000),
    idleMs: intInRange(env.AGENT_VOICE_REALTIME_IDLE_MS, 60_000, 5_000, 30 * 60 * 1000),
    fillerDelayMs: intInRange(env.AGENT_VOICE_REALTIME_FILLER_DELAY_MS, 700, 0, 10_000),
    startRateLimitMax: intInRange(env.AGENT_VOICE_REALTIME_START_RATE_LIMIT_MAX, 30, 1, 10_000),
    resumeGraceMs: intInRange(env.AGENT_VOICE_REALTIME_RESUME_GRACE_MS, 15_000, 0, 120_000),
  };
}
