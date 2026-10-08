/**
 * Providers of agent voice v2 (`/agent-voice`, docs/domains/agent.md § Voice):
 *
 * - **Streaming transcription**: an OpenAI Realtime transcription session over WebSocket
 *   (`session.update` with `session.type: 'transcription'`, PCM16 24 kHz `input_audio_buffer.append`,
 *   `semantic_vad` / `server_vad` turn detection, `…input_audio_transcription.delta/completed`).
 *   With `turnDetection: 'none'` (and always for VAD-less models such as `gpt-live-transcribe`) a
 *   server-side energy VAD commits each turn. Hints go in the model's shape
 *   (`agentVoiceSttRequestHints`: keywords + languages + context, or the older models' prompt).
 * - **Fallback**: when the realtime connection fails (or drops), a server-side energy VAD
 *   segments the PCM and each utterance goes to the v1 batch transcription as WAV. The socket
 *   contract does not change; there are just no partial captions.
 * - **Streaming speech**: OpenAI `audio.speech` with `response_format: 'pcm'` (24 kHz), read as
 *   it arrives.
 *
 * Tests swap all of them with `setAgentVoiceRealtimeProvidersForTests`.
 */
import OpenAI from 'openai';
import { WebSocket } from 'undici';
import { AGENT_VOICE_INPUT_SAMPLE_RATE } from '@bandeja/shared/agentVoiceRealtime';
import { config } from '../../../../config/env';
import type { AgentVoiceRealtimeEagerness, AgentVoiceRealtimeSttDelay, AgentVoiceRealtimeTurnDetection } from '../../../../config/agentVoiceEnv';
import { resolveProvider } from '../agentVoice.service';
import { agentVoiceSttIsLive, agentVoiceSttRequestHints, agentVoiceSttTurnDetection, type AgentVoiceSttHints } from '../agentVoiceText';
import { EnergyVad } from './agentVoiceEnergyVad';
import { pcmBytesPerMs, pcmDurationMs, pcmLevelDb, pcmToWav } from './agentVoicePcm';

// ---------------------------------------------------------------- transcription

/** Audio of one transcribed turn: its length and (when still kept) its PCM, for checks and a re-transcription. */
export type AgentVoiceTurnAudio = { ms: number; pcm: Buffer | null };

export interface AgentVoiceSttEvents {
  /** The user started talking (provider VAD or the server energy VAD). */
  speechStarted(): void;
  /** End of the user's turn (the final transcript follows). */
  speechStopped(): void;
  /** Partial transcript text of one turn (`itemId`), appended to what came before. */
  delta(itemId: string, text: string): void;
  /** Final transcript of one turn ('' = nothing usable / transcription failed); `audio` when known. */
  completed(itemId: string, transcript: string, audio?: AgentVoiceTurnAudio): void;
  /** The provider is gone (connection closed or broken). The session falls back or ends. */
  failed(error: Error): void;
}

export interface AgentVoiceSttSession {
  /** `realtime`: streaming session (billed as `agent_voice_realtime_transcription`); `batch`: v1 fallback. */
  readonly kind: 'realtime' | 'batch';
  readonly model: string;
  readonly provider: string;
  /** PCM16 mono at `AGENT_VOICE_INPUT_SAMPLE_RATE`. */
  append(pcm: Buffer): void;
  /** Drop the audio of a turn in progress (mic closed for a confirmation card, muted). */
  clear(): void;
  /** Audio ms billed since the last call (realtime: everything sent; batch: utterances transcribed). */
  takeBilledMs(): number;
  close(): void;
}

export type AgentVoiceSttOptions = {
  model: string;
  url: string;
  /** Vocabulary / language hints (`buildAgentVoiceSttHints`); null = none. */
  hints: AgentVoiceSttHints | null;
  /** Configured turn detection; VAD-less models get `none` whatever is set. */
  turnDetection: AgentVoiceRealtimeTurnDetection;
  /** `delay` of streaming models (`gpt-live-transcribe`); not sent to others. */
  delay: AgentVoiceRealtimeSttDelay;
  eagerness: AgentVoiceRealtimeEagerness;
  silenceMs: number;
  timeoutMs: number;
};

export interface AgentVoiceRealtimeSttProvider {
  readonly name: string;
  /** Resolves once the session is configured; rejects when the provider can't be reached. */
  open(options: AgentVoiceSttOptions, events: AgentVoiceSttEvents): Promise<AgentVoiceSttSession>;
}

/** Batch transcription of one WAV utterance (the v1 provider); null hints = none (answer-guard retry). */
export type AgentVoiceBatchTranscribe = (input: { wav: Buffer; hints: AgentVoiceSttHints | null; signal: AbortSignal }) => Promise<string>;

// ---------------------------------------------------------------- speech

export interface AgentVoiceSpeechStreamProvider {
  readonly name: string;
  /** PCM16 mono at `AGENT_VOICE_OUTPUT_SAMPLE_RATE`, as it arrives. */
  stream(input: { text: string; model: string; voice: string; instructions: string; signal: AbortSignal }): AsyncIterable<Buffer>;
}

export type AgentVoiceRealtimeProviders = {
  stt: AgentVoiceRealtimeSttProvider;
  tts: AgentVoiceSpeechStreamProvider;
  /** Fallback transcriber; null = no fallback (the session ends when realtime STT fails). */
  batch: { name: string; model: string; transcribe: AgentVoiceBatchTranscribe } | null;
};

// ---------------------------------------------------------------- energy-VAD segmenter

/** Pre-roll kept before the VAD's start so the first syllable is not lost. */
const PRE_ROLL_MS = 300;

type SegmentSink = {
  /** Speech started: `preRoll` is the audio just before it. */
  start(preRoll: Buffer): void;
  frame(pcm: Buffer): void;
  end(): void;
  discard(): void;
};

/** Feeds frames through an `EnergyVad` and tells the sink where utterances start and end. */
class EnergySegmenter {
  private readonly vad: EnergyVad;
  private preRoll: Buffer[] = [];
  private preRollBytes = 0;

  constructor(
    private readonly sink: SegmentSink,
    silenceMs: number,
  ) {
    this.vad = new EnergyVad({ endSilenceMs: silenceMs });
  }

  get speaking(): boolean {
    return this.vad.speaking;
  }

  push(pcm: Buffer): void {
    const ms = pcmDurationMs(pcm.length, AGENT_VOICE_INPUT_SAMPLE_RATE);
    const event = this.vad.process(pcmLevelDb(pcm), ms);
    if (this.vad.speaking && event !== 'start') {
      this.sink.frame(pcm);
      return;
    }
    if (event === 'start') {
      this.sink.start(Buffer.concat(this.preRoll));
      this.preRoll = [];
      this.preRollBytes = 0;
      this.sink.frame(pcm);
      return;
    }
    if (event === 'end') this.sink.end();
    else if (event === 'discard') this.sink.discard();
    this.preRoll.push(pcm);
    this.preRollBytes += pcm.length;
    const max = PRE_ROLL_MS * pcmBytesPerMs(AGENT_VOICE_INPUT_SAMPLE_RATE);
    while (this.preRollBytes > max && this.preRoll.length > 1) this.preRollBytes -= this.preRoll.shift()!.length;
  }

  reset(): void {
    this.vad.reset();
    this.preRoll = [];
    this.preRollBytes = 0;
  }
}

/**
 * Fallback transcription: energy-VAD utterances → WAV → batch transcription (v1 provider).
 * Turns are serialised (a transcript completes before the next one's).
 */
export function createBatchSttSession(input: {
  batch: NonNullable<AgentVoiceRealtimeProviders['batch']>;
  hints: AgentVoiceSttHints | null;
  silenceMs: number;
  timeoutMs: number;
  events: AgentVoiceSttEvents;
}): AgentVoiceSttSession {
  const { events } = input;
  const bytesPerMs = pcmBytesPerMs(AGENT_VOICE_INPUT_SAMPLE_RATE);
  const maxBytes = 30_000 * bytesPerMs;
  let utterance: Buffer[] = [];
  let utteranceBytes = 0;
  let billedMs = 0;
  let seq = 0;
  let closed = false;
  let chain: Promise<void> = Promise.resolve();
  const abort = new AbortController();
  const segmenter = new EnergySegmenter(
    {
      start(preRoll) {
        utterance = preRoll.length ? [preRoll] : [];
        utteranceBytes = preRoll.length;
        events.speechStarted();
      },
      frame(pcm) {
        if (utteranceBytes >= maxBytes) return;
        utterance.push(pcm);
        utteranceBytes += pcm.length;
      },
      end() {
        const pcm = Buffer.concat(utterance);
        utterance = [];
        utteranceBytes = 0;
        const itemId = `batch-${(seq += 1)}`;
        events.speechStopped();
        billedMs += pcmDurationMs(pcm.length, AGENT_VOICE_INPUT_SAMPLE_RATE);
        chain = chain.then(async () => {
          let text = '';
          try {
            text = await input.batch.transcribe({
              wav: pcmToWav(pcm, AGENT_VOICE_INPUT_SAMPLE_RATE),
              hints: input.hints,
              signal: AbortSignal.any([abort.signal, AbortSignal.timeout(input.timeoutMs)]),
            });
          } catch (error) {
            if (closed) return;
            console.error('[agent-voice] batch transcription failed', { error: error instanceof Error ? error.message : 'unknown' });
          }
          if (!closed) events.completed(itemId, text, { ms: pcmDurationMs(pcm.length, AGENT_VOICE_INPUT_SAMPLE_RATE), pcm });
        });
      },
      discard() {
        utterance = [];
        utteranceBytes = 0;
        events.completed(`batch-${(seq += 1)}`, '');
      },
    },
    input.silenceMs + 150,
  );
  return {
    kind: 'batch',
    model: input.batch.model,
    provider: input.batch.name,
    append(pcm) {
      if (!closed) segmenter.push(pcm);
    },
    clear() {
      segmenter.reset();
      utterance = [];
      utteranceBytes = 0;
    },
    takeBilledMs() {
      const ms = billedMs;
      billedMs = 0;
      return ms;
    },
    close() {
      closed = true;
      abort.abort();
    },
  };
}

// ---------------------------------------------------------------- OpenAI

type RealtimeServerEvent = {
  type?: string;
  item_id?: string;
  /** Speech start / end, in ms of all audio appended this session (`input_audio_buffer.clear` does not reset it). */
  audio_start_ms?: number;
  audio_end_ms?: number;
  delta?: string;
  transcript?: string;
  error?: { message?: string; code?: string; type?: string };
};

/**
 * Streaming models (`gpt-live-transcribe`) get silence after a commit until its transcript is
 * in (at most this long): without more audio their final stalled for 6–10 s more often, now and
 * then cut short (measured 2026-10, same run: 3 of 30 turns slow without, 0 of 30 with; it
 * still stalls at times). Billed like any audio sent.
 */
const POST_COMMIT_PAD_MAX_MS = 3_000;
const POST_COMMIT_PAD_CHUNK_MS = 100;

/** Audio kept to re-transcribe a turn without hints (`AgentVoiceTurnAudio.pcm`). */
const TURN_AUDIO_HISTORY_MS = 30_000;

/** The last `TURN_AUDIO_HISTORY_MS` of appended PCM, addressed by ms since the first append. */
export class PcmHistory {
  private chunks: Buffer[] = [];
  private keptBytes = 0;
  /** Byte offset (since the first append) of `chunks[0]`. */
  private startByte = 0;
  private readonly bytesPerMs = pcmBytesPerMs(AGENT_VOICE_INPUT_SAMPLE_RATE);

  /** Ms of audio appended so far. */
  get totalMs(): number {
    return (this.startByte + this.keptBytes) / this.bytesPerMs;
  }

  push(pcm: Buffer): void {
    this.chunks.push(pcm);
    this.keptBytes += pcm.length;
    const max = TURN_AUDIO_HISTORY_MS * this.bytesPerMs;
    while (this.keptBytes - this.chunks[0].length >= max) {
      const dropped = this.chunks.shift()!;
      this.keptBytes -= dropped.length;
      this.startByte += dropped.length;
    }
  }

  /** PCM between two ms marks, or null when its start is no longer kept. */
  slice(fromMs: number, toMs: number): Buffer | null {
    const align = (ms: number) => Math.floor((ms * this.bytesPerMs) / 2) * 2;
    const from = align(Math.max(0, fromMs)) - this.startByte;
    const to = Math.min(align(toMs) - this.startByte, this.keptBytes);
    if (from < 0 || to <= from) return null;
    return Buffer.concat(this.chunks).subarray(from, to);
  }
}

function turnDetectionConfig(options: AgentVoiceSttOptions): Record<string, unknown> | null {
  const turnDetection = agentVoiceSttTurnDetection(options.model, options.turnDetection);
  if (turnDetection === 'none') return null;
  if (turnDetection === 'server_vad') {
    return { type: 'server_vad', threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: options.silenceMs };
  }
  return { type: 'semantic_vad', eagerness: options.eagerness };
}

export function openAiTranscriptionSessionUpdate(options: AgentVoiceSttOptions): Record<string, unknown> {
  return {
    type: 'session.update',
    session: {
      type: 'transcription',
      audio: {
        input: {
          format: { type: 'audio/pcm', rate: AGENT_VOICE_INPUT_SAMPLE_RATE },
          transcription: {
            model: options.model,
            ...agentVoiceSttRequestHints(options.model, options.hints),
            ...(agentVoiceSttIsLive(options.model) ? { delay: options.delay } : {}),
          },
          turn_detection: turnDetectionConfig(options),
          noise_reduction: { type: 'near_field' },
        },
      },
    },
  };
}

function createOpenAiRealtimeSttProvider(apiKey: string): AgentVoiceRealtimeSttProvider {
  return {
    name: 'openai',
    open(options, events) {
      return new Promise<AgentVoiceSttSession>((resolve, reject) => {
        const socket = new WebSocket(options.url, { headers: { Authorization: `Bearer ${apiKey}` } });
        let ready = false;
        let closed = false;
        let billedBytes = 0;
        const history = new PcmHistory();
        /** Speech span per item (ms marks of `history`). */
        const spans = new Map<string, { startMs: number; endMs: number | null }>();
        /** Energy-VAD turns committed, waiting for the provider's `committed` item id. */
        const committing: { startMs: number; endMs: number }[] = [];
        let segmentStartMs = 0;
        const turnDetection = agentVoiceSttTurnDetection(options.model, options.turnDetection);
        const live = agentVoiceSttIsLive(options.model);
        /** Committed turns whose transcript hasn't arrived (live models: pad meanwhile). */
        let awaitingFinals = 0;
        let padTimer: ReturnType<typeof setInterval> | null = null;
        let padStartedAt = 0;
        const stopPadding = () => {
          if (padTimer) clearInterval(padTimer);
          padTimer = null;
        };
        const padAfterCommit = () => {
          if (!live) return;
          padStartedAt = Date.now();
          if (padTimer) return;
          const chunk = Buffer.alloc(POST_COMMIT_PAD_CHUNK_MS * pcmBytesPerMs(AGENT_VOICE_INPUT_SAMPLE_RATE));
          padTimer = setInterval(() => {
            if (closed || awaitingFinals === 0 || segmenter?.speaking || Date.now() - padStartedAt > POST_COMMIT_PAD_MAX_MS) {
              stopPadding();
              return;
            }
            appendRaw(chunk);
          }, POST_COMMIT_PAD_CHUNK_MS);
          padTimer.unref?.();
        };
        const send = (event: Record<string, unknown>) => {
          if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(event));
        };
        // VAD-less models: the server energy VAD decides turns and commits them.
        const segmenter =
          turnDetection === 'none'
            ? new EnergySegmenter(
                {
                  start(preRoll) {
                    events.speechStarted();
                    segmentStartMs = history.totalMs;
                    if (preRoll.length) appendRaw(preRoll);
                  },
                  frame: (pcm) => appendRaw(pcm),
                  end() {
                    events.speechStopped();
                    committing.push({ startMs: segmentStartMs, endMs: history.totalMs });
                    send({ type: 'input_audio_buffer.commit' });
                    awaitingFinals += 1;
                    padAfterCommit();
                  },
                  discard: () => send({ type: 'input_audio_buffer.clear' }),
                },
                options.silenceMs,
              )
            : null;
        function appendRaw(pcm: Buffer): void {
          billedBytes += pcm.length;
          history.push(pcm);
          send({ type: 'input_audio_buffer.append', audio: pcm.toString('base64') });
        }
        const timer = setTimeout(() => fail(new Error('realtime transcription: session not ready in time')), options.timeoutMs);
        timer.unref?.();
        const fail = (error: Error) => {
          clearTimeout(timer);
          stopPadding();
          if (closed) return;
          closed = true;
          try {
            socket.close();
          } catch {
            // already closing
          }
          if (ready) events.failed(error);
          else reject(error);
        };
        const session: AgentVoiceSttSession = {
          kind: 'realtime',
          model: options.model,
          provider: 'openai',
          append(pcm) {
            if (closed) return;
            if (segmenter) segmenter.push(pcm);
            else appendRaw(pcm);
          },
          clear() {
            segmenter?.reset();
            send({ type: 'input_audio_buffer.clear' });
          },
          takeBilledMs() {
            const ms = pcmDurationMs(billedBytes, AGENT_VOICE_INPUT_SAMPLE_RATE);
            billedBytes = 0;
            return ms;
          },
          close() {
            clearTimeout(timer);
            stopPadding();
            if (closed) return;
            closed = true;
            try {
              socket.close();
            } catch {
              // already closing
            }
          },
        };
        socket.addEventListener('open', () => send(openAiTranscriptionSessionUpdate(options)));
        socket.addEventListener('message', (message) => {
          let event: RealtimeServerEvent;
          try {
            event = JSON.parse(typeof message.data === 'string' ? message.data : Buffer.from(message.data as ArrayBuffer).toString());
          } catch {
            return;
          }
          switch (event.type) {
            case 'session.updated':
            case 'transcription_session.updated':
              if (!ready) {
                ready = true;
                clearTimeout(timer);
                resolve(session);
              }
              break;
            case 'input_audio_buffer.speech_started':
              if (segmenter) break;
              if (event.item_id && typeof event.audio_start_ms === 'number') spans.set(event.item_id, { startMs: event.audio_start_ms, endMs: null });
              events.speechStarted();
              break;
            case 'input_audio_buffer.speech_stopped':
              if (segmenter) break;
              if (event.item_id && typeof event.audio_end_ms === 'number') {
                const span = spans.get(event.item_id);
                if (span) span.endMs = event.audio_end_ms;
              }
              events.speechStopped();
              break;
            case 'input_audio_buffer.committed': {
              const span = segmenter ? committing.shift() : undefined;
              if (span && event.item_id) spans.set(event.item_id, span);
              break;
            }
            case 'conversation.item.input_audio_transcription.delta':
              if (event.item_id && event.delta) events.delta(event.item_id, event.delta);
              break;
            case 'conversation.item.input_audio_transcription.completed': {
              if (!event.item_id) break;
              if (awaitingFinals > 0) awaitingFinals -= 1;
              const span = spans.get(event.item_id);
              spans.delete(event.item_id);
              const audio =
                span?.endMs != null && span.endMs > span.startMs
                  ? { ms: span.endMs - span.startMs, pcm: history.slice(span.startMs - PRE_ROLL_MS, span.endMs) }
                  : undefined;
              events.completed(event.item_id, event.transcript ?? '', audio);
              break;
            }
            case 'conversation.item.input_audio_transcription.failed':
              console.error('[agent-voice] realtime transcription item failed', { code: event.error?.code, message: event.error?.message });
              if (awaitingFinals > 0) awaitingFinals -= 1;
              if (event.item_id) {
                spans.delete(event.item_id);
                events.completed(event.item_id, '');
              }
              break;
            case 'error':
              console.error('[agent-voice] realtime transcription error', { code: event.error?.code, message: event.error?.message });
              // Before the session is configured an error means the config was refused: fall back.
              if (!ready) fail(new Error(`realtime transcription: ${event.error?.message ?? 'error'}`));
              break;
            default:
              break;
          }
        });
        socket.addEventListener('error', () => fail(new Error('realtime transcription: connection error')));
        socket.addEventListener('close', (event) => fail(new Error(`realtime transcription: closed (${event.code})`)));
      });
    },
  };
}

function createOpenAiSpeechStreamProvider(apiKey: string): AgentVoiceSpeechStreamProvider {
  const client = new OpenAI({ apiKey, maxRetries: 1 });
  return {
    name: 'openai',
    async *stream({ text, model, voice, instructions, signal }) {
      const res = await client.audio.speech.create(
        {
          model,
          voice,
          input: text,
          response_format: 'pcm',
          // Only the gpt-4o TTS models take style instructions; tts-1 rejects the field.
          ...(model.startsWith('gpt-') ? { instructions } : {}),
        },
        { signal },
      );
      if (!res.body) return;
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) yield Buffer.from(chunk);
    },
  };
}

/** The v1 batch provider, resolved per call (live config, v1 test override). */
const v1Batch: NonNullable<AgentVoiceRealtimeProviders['batch']> = {
  name: 'openai',
  get model() {
    return config.agentVoice.sttModel;
  },
  transcribe: ({ wav, hints, signal }) => {
    const voiceConfig = config.agentVoice;
    return resolveProvider(voiceConfig).transcribe({
      audio: wav,
      mimeType: 'audio/wav',
      filename: 'speech.wav',
      hints,
      model: voiceConfig.sttModel,
      signal,
    });
  },
};

// ---------------------------------------------------------------- resolution

let override: AgentVoiceRealtimeProviders | null | undefined;

/** Tests: fakes, `null` = "not configured", `undefined` = OpenAI again. */
export function setAgentVoiceRealtimeProvidersForTests(providers: AgentVoiceRealtimeProviders | null | undefined): void {
  override = providers;
}

let cached: { apiKey: string; providers: AgentVoiceRealtimeProviders } | null = null;

/** v2 providers, or null when v2 is unavailable (flag off, voice off, no OpenAI key). */
export function resolveAgentVoiceRealtimeProviders(): AgentVoiceRealtimeProviders | null {
  const voiceConfig = config.agentVoice;
  if (!voiceConfig.enabled || !voiceConfig.realtime.enabled) return null;
  if (override !== undefined) return override;
  const apiKey = config.openai.apiKey;
  if (!apiKey) return null;
  if (cached?.apiKey !== apiKey) {
    cached = {
      apiKey,
      providers: { stt: createOpenAiRealtimeSttProvider(apiKey), tts: createOpenAiSpeechStreamProvider(apiKey), batch: v1Batch },
    };
  }
  return cached.providers;
}

