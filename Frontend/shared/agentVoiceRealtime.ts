/**
 * AI agent voice v2 — realtime wire contract (Socket.IO namespace `/agent-voice`).
 *
 * Shared by Backend (`@bandeja/shared/agentVoiceRealtime`) and Frontend (`@shared/agentVoiceRealtime`).
 * v1 (HTTP `POST /voice/transcriptions` + `POST /voice/speech`) stays for shipped store builds and as
 * the fallback whenever v2 is unavailable (`VOICE_V2_UNAVAILABLE`, connect failure, flag off).
 *
 * Flow: the app opens the namespace with the usual JWT (`auth.token`), emits `voice:start`, then
 * streams mic audio as binary `voice:audio` frames. The server owns the turn loop: streaming
 * transcription with server-side end-of-turn detection → a voice run on the chat (same run loop,
 * tools, confirm rule and budget as a typed turn) → server-side sentence chunking → streaming TTS
 * sent back as binary `voice:audio-out` chunks. The app still follows the run over its SSE
 * attachment for cards / Confirm; the socket only carries audio, captions, phases and timings.
 */

export const AGENT_VOICE_NAMESPACE = '/agent-voice';

/** Mic audio: PCM16 little-endian, mono. */
export const AGENT_VOICE_INPUT_SAMPLE_RATE = 24_000;
/** Reply audio: PCM16 little-endian, mono (OpenAI TTS `pcm`). */
export const AGENT_VOICE_OUTPUT_SAMPLE_RATE = 24_000;
/** The app sends mic audio in frames of this many ms (one or more frames per `voice:audio`). */
export const AGENT_VOICE_FRAME_MS = 20;

export type AgentVoicePhase =
  /** Mic open, waiting for speech. */
  | 'listening'
  /** Speech detected, partial captions arriving. */
  | 'hearing'
  /** End of turn detected; run queued / running, nothing spoken yet. */
  | 'thinking'
  /** Reply audio is being sent / played. */
  | 'speaking'
  /** Run ended AWAITING_CONFIRMATION: mic off until the user taps Confirm / Reject / the orb. */
  | 'confirm'
  | 'ended';

export type AgentVoiceErrorCode =
  | 'VOICE_V2_UNAVAILABLE'
  | 'VOICE_UNAVAILABLE'
  | 'BUDGET_EXCEEDED'
  | 'RATE_LIMITED'
  | 'CHAT_BUSY'
  | 'NOT_FOUND'
  | 'BAD_REQUEST'
  | 'INTERNAL';

/** Turn timeline marks (ms epoch). Phase 0 instrumentation; client and server each fill their own. */
export type AgentVoiceTimingMark =
  // client
  | 'speechStart'
  | 'firstAudioSent'
  | 'playbackStart'
  // server
  | 'firstAudioReceived'
  | 'endOfTurn'
  | 'transcriptFinal'
  | 'runQueued'
  | 'runStarted'
  | 'firstTextDelta'
  | 'firstSentence'
  | 'ttsRequested'
  | 'firstTtsByte'
  | 'firstAudioOutSent';

export type AgentVoiceTimings = Partial<Record<AgentVoiceTimingMark, number>>;

// ---------------------------------------------------------------- client → server

export interface AgentVoiceStartPayload {
  chatId: string;
  /** App locale (same value as `X-App-Locale`). */
  locale?: string;
  inputSampleRate: typeof AGENT_VOICE_INPUT_SAMPLE_RATE;
  /** Start muted (mic frames ignored until `voice:mute {muted:false}`). */
  muted?: boolean;
}

export type AgentVoiceStartAck =
  | { ok: true; sessionId: string; outputSampleRate: number; maxSessionMs: number }
  | { ok: false; code: AgentVoiceErrorCode; message?: string; retryAt?: string };

export interface AgentVoiceMutePayload {
  muted: boolean;
}

/** User tapped the orb / spoke over the reply (client-side barge-in): stop speech, cancel the run. */
export interface AgentVoiceInterruptPayload {
  turnId?: string;
  /** ms of the current turn's reply audio actually played (for truncating the stored reply). */
  playedMs?: number;
}

/** Playback progress of the reply, so the server knows what was really heard. */
export interface AgentVoicePlaybackPayload {
  turnId: string;
  playedMs: number;
  /** All audio of the turn was played. */
  done: boolean;
}

/** After the user tapped Confirm: speak the follow-up run (if any) and resume listening. */
export interface AgentVoiceFollowRunPayload {
  runId: string;
}

/** After the user tapped Reject / the orb on a confirm card: resume listening. */
export type AgentVoiceResumePayload = Record<string, never>;

export interface AgentVoiceClientTimingPayload {
  turnId: string;
  marks: AgentVoiceTimings;
}

export interface AgentVoiceClientToServerEvents {
  'voice:start': (payload: AgentVoiceStartPayload, ack: (res: AgentVoiceStartAck) => void) => void;
  /** Binary: one or more 20 ms PCM16 frames at `inputSampleRate`. */
  'voice:audio': (chunk: ArrayBuffer) => void;
  'voice:mute': (payload: AgentVoiceMutePayload) => void;
  'voice:interrupt': (payload: AgentVoiceInterruptPayload) => void;
  'voice:playback': (payload: AgentVoicePlaybackPayload) => void;
  'voice:follow-run': (payload: AgentVoiceFollowRunPayload) => void;
  'voice:resume': (payload: AgentVoiceResumePayload) => void;
  'voice:timing': (payload: AgentVoiceClientTimingPayload) => void;
  'voice:end': () => void;
}

// ---------------------------------------------------------------- server → client

export interface AgentVoiceStatePayload {
  phase: AgentVoicePhase;
  turnId?: string;
  runId?: string;
  /** phase `confirm`: the pending card's server-rendered title. */
  confirmTitle?: string;
  /** phase `ended`: why. */
  reason?: 'user' | 'idle' | 'max_duration' | 'error' | 'replaced';
}

/** Live caption of the user's speech. `final` once the transcript is committed for the turn. */
export interface AgentVoiceCaptionPayload {
  turnId: string;
  text: string;
  final: boolean;
}

/** A turn became a run (user message stored). */
export interface AgentVoiceTurnPayload {
  turnId: string;
  runId: string;
  transcript: string;
}

/**
 * Text being spoken. `reply` = a sentence of the model's answer (in order, matches the audio that
 * follows); `progress` = a short localized filler while a tool runs ("Checking your games…");
 * `confirm` = the spoken prompt for a pending card.
 */
export interface AgentVoiceSpeechTextPayload {
  turnId: string;
  seq: number;
  kind: 'reply' | 'progress' | 'confirm';
  text: string;
}

/** Binary reply audio: PCM16 at `outputSampleRate`, in order per turn (`seq` restarts at 0 per turn). */
export interface AgentVoiceAudioOutPayload {
  turnId: string;
  seq: number;
  pcm: ArrayBuffer;
}

export interface AgentVoiceAudioEndPayload {
  turnId: string;
}

/** Server-side barge-in (user started speaking over the reply): drop queued playback now. */
export interface AgentVoiceStopPlaybackPayload {
  turnId: string;
}

export interface AgentVoiceErrorPayload {
  code: AgentVoiceErrorCode;
  message?: string;
  /** Fatal errors end the session (the app falls back to the dock's error state / v1). */
  fatal: boolean;
  retryAt?: string;
}

export interface AgentVoiceServerTimingPayload {
  turnId: string;
  marks: AgentVoiceTimings;
}

export interface AgentVoiceServerToClientEvents {
  'voice:state': (payload: AgentVoiceStatePayload) => void;
  'voice:caption': (payload: AgentVoiceCaptionPayload) => void;
  'voice:turn': (payload: AgentVoiceTurnPayload) => void;
  'voice:speech-text': (payload: AgentVoiceSpeechTextPayload) => void;
  'voice:audio-out': (payload: AgentVoiceAudioOutPayload) => void;
  'voice:audio-end': (payload: AgentVoiceAudioEndPayload) => void;
  'voice:stop-playback': (payload: AgentVoiceStopPlaybackPayload) => void;
  'voice:error': (payload: AgentVoiceErrorPayload) => void;
  'voice:timing': (payload: AgentVoiceServerTimingPayload) => void;
}
