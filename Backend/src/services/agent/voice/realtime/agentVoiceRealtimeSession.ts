/**
 * One v2 voice conversation (`/agent-voice`, docs/domains/agent.md § Voice). The server owns
 * the turn loop that v1 ran in the app:
 *
 *   listening ─speech─▶ hearing ─end of turn─▶ thinking ─first audio─▶ speaking ─played─▶ listening
 *       ▲                                         │ run awaits a confirmation              │
 *       └──────── voice:resume / follow-run ◀── confirm ◀──────────────────────────────────┘
 *
 * - Mic PCM streams into a transcription session (realtime, or the batch fallback); its
 *   end-of-turn + final transcript become a voice run (`sendAgentUserMessage`, `voice: true`).
 * - The run's events are followed from the event store: `text.delta` → `SpeechChunker` →
 *   streaming TTS (two sentences in flight, audio sent strictly in order). Voice runs skip the
 *   narration hold, so a short line before a tool call ("Let me check.") is spoken (flushed at
 *   `tool.started`); a tool that starts while nothing has been said yet gets one short spoken
 *   filler (its localized label).
 * - Barge-in: transcription keeps running while thinking / speaking. Speech that lasts
 *   (≥ 300 ms, or a caption delta while it is still going on), a final transcript of a shorter
 *   sound, or `voice:interrupt` stops playback, cancels the run and cuts the stored reply to
 *   what was heard. A final transcript that is the reply itself (speaker echo) is dropped.
 * - Transcript guard: a transcript longer than its audio could hold (the model answered the
 *   request instead of transcribing it) is re-transcribed once without the prompt, or dropped.
 * - A spoken "yes" never confirms: a run ending AWAITING_CONFIRMATION parks the session in
 *   `confirm` (mic ignored) until `voice:follow-run` / `voice:resume`.
 * - Ending the session never cancels a run: the reply still lands in the chat.
 * - A dropped socket `suspend`s the session (no audio / STT metering, no idle end) until the
 *   namespace resumes it on a new socket (`resumeTransport`) or its grace runs out.
 */
import {
  AGENT_VOICE_INPUT_SAMPLE_RATE,
  AGENT_VOICE_OUTPUT_SAMPLE_RATE,
  type AgentVoiceErrorCode,
  type AgentVoicePhase,
  type AgentVoiceServerToClientEvents,
  type AgentVoiceStatePayload,
  type AgentVoiceTimingMark,
  type AgentVoiceTimings,
} from '@bandeja/shared/agentVoiceRealtime';
import { SpeechChunker, type SpeechPiece } from '@bandeja/shared/agentVoiceSpeech';
import type { AgentStreamEvent } from '@bandeja/shared/agentContract';
import type { AgentVoiceEnvConfig } from '../../../../config/agentVoiceEnv';
import { agentVoiceConfirmPrompt } from '../../i18n/agentVoiceI18n';
import { cleanAgentVoiceTranscript, isAgentVoiceEcho, isImplausibleAgentVoiceTranscript, normalizeAgentSpeechText } from '../agentVoiceText';
import { heardReplyOffset, type AgentVoiceSpokenItem } from './agentVoiceHeard';
import { PcmRechunker, pcmBytesPerMs, pcmDurationMs, pcmToWav } from './agentVoicePcm';
import {
  createBatchSttSession,
  type AgentVoiceRealtimeProviders,
  type AgentVoiceSttEvents,
  type AgentVoiceSttSession,
  type AgentVoiceTurnAudio,
} from './agentVoiceRealtimeProviders';
import type { AgentVoiceRunPort } from './agentVoiceRuns';

type ServerEvents = AgentVoiceServerToClientEvents;
export type AgentVoiceEmit = <E extends keyof ServerEvents>(event: E, payload: Parameters<ServerEvents[E]>[0]) => void;
export type AgentVoiceEndReason = NonNullable<AgentVoiceStatePayload['reason']>;

/** Usage rows (`LlmUsageLog`); sizes and counts only, never audio or text. */
export type AgentVoiceUsage = {
  kind: 'realtime_transcription' | 'batch_transcription' | 'speech';
  provider: string;
  model: string;
  /** Transcription: audio ms. Speech: characters. */
  amount: number;
};

/** A typed error from a dependency (`ApiError` details or a plain code). */
export type AgentVoiceDepError = { code: AgentVoiceErrorCode; message?: string; retryAt?: string };

export interface AgentVoiceSessionDeps {
  sessionId: string;
  user: { id: string; isAdmin: boolean };
  chatId: string;
  locale: string | null;
  clientCaps: readonly string[] | null;
  muted: boolean;
  config: AgentVoiceEnvConfig;
  providers: AgentVoiceRealtimeProviders;
  runs: AgentVoiceRunPort;
  emit: AgentVoiceEmit;
  /** Transcription vocabulary prompt. */
  vocabulary: () => Promise<string>;
  /** Null = within budget; else the error to report (fatal). */
  checkBudget: () => Promise<AgentVoiceDepError | null>;
  recordUsage: (usage: AgentVoiceUsage) => Promise<void>;
  /** Maps a thrown error of `runs.send` to a voice error code. */
  classifyError: (error: unknown) => AgentVoiceDepError;
  /** The session ended (the namespace forgets it). */
  onEnded: (reason: AgentVoiceEndReason) => void;
  now?: () => number;
  log?: (line: string) => void;
}

type SpeechItem = AgentVoiceSpokenItem & {
  seq: number;
  chunks: Buffer[];
  textSent: boolean;
  failed: boolean;
  started: boolean;
};

type TurnOutcome = 'completed' | 'confirm' | 'failed' | 'cancelled';

type Turn = {
  id: string;
  marks: AgentVoiceTimings;
  clientMarks: AgentVoiceTimings;
  transcript: string;
  /** USER message of the turn (a continuation re-sends over it). */
  messageId: string | null;
  runId: string | null;
  feed: { close(): void } | null;
  chunker: SpeechChunker;
  /** All `text.delta` text of the run, in order (raw offsets of reply items point into it). */
  streamed: string;
  runDone: boolean;
  outcome: TurnOutcome | null;
  failure: AgentVoiceDepError | null;
  pendingTitle: string | null;
  items: SpeechItem[];
  playIndex: number;
  inFlight: number;
  textSeq: number;
  audioSeq: number;
  audioBytes: number;
  firstAudioAt: number | null;
  abort: AbortController;
  /** Reply text was queued (fillers / confirm prompts don't count). */
  spokeReply: boolean;
  openTools: Map<string, string>;
  fillers: number;
  lastFillerAt: number | null;
  fillerTimer: NodeJS.Timeout | null;
  audioEnded: boolean;
  playedMs: number;
  playbackTimer: NodeJS.Timeout | null;
  /** Stopped by a barge-in / superseded: nothing more of it is sent. */
  stopped: boolean;
  closed: boolean;
  speechFailed: boolean;
};

/** A turn stopped before its reply was said: the next turn re-sends it with the new words. */
type Continuable = { text: string; messageId: string | null };

/** User speech being captured (before it becomes a turn). */
type Capture = {
  turnId: string;
  marks: AgentVoiceTimings;
  captions: Map<string, string>;
  order: string[];
};

const MAX_TTS_IN_FLIGHT = 2;
/** ~150 ms of 24 kHz PCM16 per `voice:audio-out`. */
const AUDIO_OUT_FRAME_BYTES = Math.round(0.15 * AGENT_VOICE_OUTPUT_SAMPLE_RATE) * 2;
/** Speech over the reply counts as barge-in once it lasts this long (speaker echo is short). */
const BARGE_IN_CONFIRM_MS = 300;
/** A second filler only when a step keeps going this much longer. */
const SECOND_FILLER_AFTER_MS = 4_000;
const MAX_FILLERS_PER_TURN = 2;
/** After `voice:audio-end`, wait at most the audio left + this for the client's `done`. */
const PLAYBACK_GRACE_MS = 2_500;
/**
 * The app streams silence only while `hearing` (thinking / speaking: voice + a 300 ms tail; listening:
 * a 1.5 s hangover). Silence is padded only while the provider has speech open (mid-utterance,
 * including a barge-in or echo during the reply), so it can end that turn; otherwise none is
 * sent or billed.
 */
const GAP_FILL_AFTER_MS = 200;
const GAP_FILL_TICK_MS = 100;
const GAP_FILL_MAX_MS = 3_000;
/** Audio buffered while the transcription session connects. */
const CONNECT_BUFFER_MAX_MS = 10_000;
/** Flush the transcription usage row at least this often while audio flows. */
const STT_USAGE_FLUSH_MS = 60_000;

export class AgentVoiceRealtimeSession {
  private phase: AgentVoicePhase = 'listening';
  /** The last `voice:state` (re-sent when a reconnect resumes the session). */
  private lastState: AgentVoiceStatePayload = { phase: 'listening' };
  private muted: boolean;
  private ended = false;
  /** The socket dropped: held for a reconnect (no audio, no STT streaming / metering, no idle end). */
  private suspended = false;
  private stt: AgentVoiceSttSession | null = null;
  private connectBuffer: Buffer[] = [];
  private connectBufferBytes = 0;
  private sttFailedOver = false;
  private turnSeq = 0;
  private capture: Capture | null = null;
  private turn: Turn | null = null;
  /** Runs this session already followed (a repeated follow-run never restarts one). */
  private readonly seenRuns = new Set<string>();
  private pendingCancel: Promise<void> = Promise.resolve();
  /** Turn starts run one at a time (a continuation needs the previous turn's message id). */
  private turnChain: Promise<void> = Promise.resolve();
  /**
   * A turn stopped before anything of its reply was said: the next turn continues it (one USER
   * message, re-sent with both parts). Cleared when the session goes back to listening.
   */
  private continuable: Continuable | null = null;
  private speechActive = false;
  private lastFrameAt = 0;
  private gapFilledMs = 0;
  private gapTimer: NodeJS.Timeout | null = null;
  private bargeTimer: NodeJS.Timeout | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private maxTimer: NodeJS.Timeout | null = null;
  private sttBilledSince = 0;
  private prompt = '';
  private readonly now: () => number;
  private readonly log: (line: string) => void;

  constructor(private readonly deps: AgentVoiceSessionDeps) {
    this.muted = deps.muted;
    this.now = deps.now ?? (() => Date.now());
    this.log = deps.log ?? ((line) => console.info(line));
  }

  get id(): string {
    return this.deps.sessionId;
  }

  get userId(): string {
    return this.deps.user.id;
  }

  get currentPhase(): AgentVoicePhase {
    return this.phase;
  }

  get isEnded(): boolean {
    return this.ended;
  }

  get isSuspended(): boolean {
    return this.suspended;
  }

  // --- lifecycle -------------------------------------------------------------------------------

  /** Opens transcription (falls back to batch when realtime can't connect). Audio is buffered meanwhile. */
  async start(): Promise<void> {
    const { config } = this.deps;
    this.maxTimer = setTimeout(() => this.end('max_duration'), config.realtime.maxSessionMs);
    this.maxTimer.unref?.();
    this.gapTimer = setInterval(() => this.fillGap(), GAP_FILL_TICK_MS);
    this.gapTimer.unref?.();
    this.sttBilledSince = this.now();
    this.deps.emit('voice:state', { phase: 'listening' });
    this.armIdle();
    try {
      this.prompt = await this.deps.vocabulary();
    } catch {
      this.prompt = '';
    }
    if (this.ended) return;
    try {
      const session = await this.deps.providers.stt.open(
        {
          model: config.realtime.sttModel,
          url: config.realtime.sttUrl,
          prompt: this.prompt,
          turnDetection: config.realtime.turnDetection,
          eagerness: config.realtime.vadEagerness,
          silenceMs: config.realtime.silenceMs,
          timeoutMs: Math.min(config.timeoutMs, 8_000),
        },
        this.sttEvents(),
      );
      if (this.ended) {
        session.close();
        return;
      }
      this.stt = session;
    } catch (error) {
      console.warn('[agent-voice] realtime transcription unavailable, using batch fallback', {
        sessionId: this.id,
        error: error instanceof Error ? error.message : 'unknown',
      });
      if (!this.useBatchFallback()) return;
    }
    const buffered = this.connectBuffer;
    this.connectBuffer = [];
    this.connectBufferBytes = 0;
    for (const pcm of buffered) this.stt?.append(pcm);
  }

  end(reason: AgentVoiceEndReason): void {
    if (this.ended) return;
    this.ended = true;
    for (const timer of [this.idleTimer, this.maxTimer, this.bargeTimer]) if (timer) clearTimeout(timer);
    if (this.gapTimer) clearInterval(this.gapTimer);
    this.idleTimer = this.maxTimer = this.bargeTimer = this.gapTimer = null;
    const turn = this.turn;
    if (turn) {
      // Never cancels the run: the reply still lands in the chat.
      this.stopTurnAudio(turn);
      this.closeTurn(turn);
    }
    this.flushSttUsage();
    this.stt?.close();
    this.stt = null;
    this.phase = 'ended';
    this.deps.emit('voice:state', { phase: 'ended', reason });
    this.deps.onEnded(reason);
  }

  /**
   * The socket dropped (not `voice:end`): keep the run / turn state for a reconnect. Speech being
   * captured is dropped, STT gets no audio (so nothing is metered) and the idle clock stops; a
   * live run goes on and its reply still lands in the chat.
   */
  suspend(): void {
    if (this.ended || this.suspended) return;
    this.suspended = true;
    this.flushSttUsage();
    this.stt?.clear();
    this.connectBuffer = [];
    this.connectBufferBytes = 0;
    this.speechActive = false;
    if (this.bargeTimer) clearTimeout(this.bargeTimer);
    this.bargeTimer = null;
    this.clearIdle();
    if (this.phase === 'hearing' && !this.turn?.runId) {
      this.capture = null;
      this.toListening();
    }
  }

  /** A reconnect resumed the session: re-send the current phase, listen again. */
  resumeTransport(): void {
    if (this.ended || !this.suspended) return;
    this.suspended = false;
    this.sttBilledSince = this.now();
    this.lastFrameAt = 0;
    this.deps.emit('voice:state', { ...this.lastState });
    if (this.phase === 'listening') this.armIdle();
  }

  // --- client → session ------------------------------------------------------------------------

  audio(pcm: Buffer): void {
    if (this.ended || this.suspended || this.muted || this.phase === 'confirm') return;
    this.lastFrameAt = this.now();
    this.gapFilledMs = 0;
    if (this.capture && this.capture.marks.firstAudioReceived == null) this.capture.marks.firstAudioReceived = this.lastFrameAt;
    if (!this.stt) {
      // Still connecting: keep the start of the turn (bounded).
      const max = CONNECT_BUFFER_MAX_MS * pcmBytesPerMs(AGENT_VOICE_INPUT_SAMPLE_RATE);
      if (this.connectBufferBytes + pcm.length <= max) {
        this.connectBuffer.push(pcm);
        this.connectBufferBytes += pcm.length;
      }
      return;
    }
    this.stt.append(pcm);
    if (this.now() - this.sttBilledSince >= STT_USAGE_FLUSH_MS) this.flushSttUsage();
  }

  setMuted(muted: boolean): void {
    if (this.ended || this.muted === muted) return;
    this.muted = muted;
    if (muted) {
      this.stt?.clear();
      this.speechActive = false;
      if (this.phase === 'hearing' && !this.turn?.runId) {
        this.capture = null;
        this.toListening();
      }
    }
  }

  /**
   * Orb tap / client-side barge-in: stop speech, cancel the run, listen. With a `turnId` that is
   * neither the current turn nor the speech being captured, the interrupt is stale (sent for an
   * older turn) and ignored, so it never cancels a newer one.
   */
  interrupt(playedMs: number | undefined, turnId?: string): void {
    if (this.ended) return;
    if (turnId !== undefined && turnId !== this.turn?.id && turnId !== this.capture?.turnId) return;
    const turn = this.turn;
    if (turn && !turn.closed) {
      if (typeof playedMs === 'number' && Number.isFinite(playedMs)) turn.playedMs = Math.max(turn.playedMs, playedMs);
      this.bargeIn(turn);
    }
    if (this.phase !== 'hearing') this.toListening();
  }

  playback(turnId: string, playedMs: number, done: boolean): void {
    const turn = this.turn;
    if (this.ended || !turn || turn.id !== turnId) return;
    if (Number.isFinite(playedMs)) turn.playedMs = Math.max(turn.playedMs, playedMs);
    if (done && turn.audioEnded) this.afterPlayback(turn);
  }

  /** After Confirm: speak the follow-up run. */
  async followRun(runId: string): Promise<void> {
    if (this.ended || this.seenRuns.has(runId)) return;
    if (this.turn && !this.turn.closed) {
      this.stopTurnAudio(this.turn);
      this.closeTurn(this.turn);
    }
    const turn = this.newTurn(this.nextTurnId(), {});
    turn.runId = runId;
    this.turn = turn;
    this.seenRuns.add(runId);
    this.setPhase('thinking', { turnId: turn.id, runId });
    const ok = await this.follow(turn);
    if (!ok && this.turn === turn) {
      this.closeTurn(turn);
      this.error({ code: 'NOT_FOUND', message: 'Run not found' }, false);
      this.toListening();
    }
  }

  /** After Reject / the orb on a confirm card. */
  resume(): void {
    if (this.ended) return;
    if (this.phase === 'confirm' || this.phase === 'listening') this.toListening();
  }

  clientTiming(turnId: string, marks: AgentVoiceTimings): void {
    const turn = this.turn;
    if (!turn || turn.id !== turnId) return;
    for (const [key, value] of Object.entries(marks)) {
      if (typeof value === 'number' && Number.isFinite(value)) turn.clientMarks[key as AgentVoiceTimingMark] = value;
    }
  }

  // --- transcription ---------------------------------------------------------------------------

  private sttEvents(): AgentVoiceSttEvents {
    return {
      speechStarted: () => this.onSpeechStarted(),
      speechStopped: () => this.onSpeechStopped(),
      delta: (itemId, text) => this.onDelta(itemId, text),
      completed: (itemId, transcript, audio) => void this.onCompleted(itemId, transcript, audio),
      failed: (error) => this.onSttFailed(error),
    };
  }

  private useBatchFallback(): boolean {
    const { providers, config } = this.deps;
    if (!providers.batch) {
      this.error({ code: 'VOICE_UNAVAILABLE', message: 'Voice is temporarily unavailable' }, true);
      return false;
    }
    this.stt = createBatchSttSession({
      batch: providers.batch,
      prompt: this.prompt,
      silenceMs: config.realtime.silenceMs,
      timeoutMs: config.timeoutMs,
      events: this.sttEvents(),
    });
    return true;
  }

  private onSttFailed(error: Error): void {
    if (this.ended || this.sttFailedOver) return;
    this.sttFailedOver = true;
    console.warn('[agent-voice] realtime transcription dropped, using batch fallback', { sessionId: this.id, error: error.message });
    this.flushSttUsage();
    this.stt = null;
    this.speechActive = false;
    if (this.phase === 'hearing' && !this.turn?.runId) {
      this.capture = null;
      this.toListening();
    }
    this.useBatchFallback();
  }

  private ensureCapture(): Capture {
    if (!this.capture) {
      this.capture = { turnId: this.nextTurnId(), marks: {}, captions: new Map(), order: [] };
      if (this.lastFrameAt) this.capture.marks.firstAudioReceived = this.lastFrameAt;
    }
    return this.capture;
  }

  private onSpeechStarted(): void {
    if (this.ended) return;
    this.speechActive = true;
    const capture = this.ensureCapture();
    const { phase } = this;
    if (phase === 'listening') {
      this.clearIdle();
      this.setPhase('hearing', { turnId: capture.turnId });
    } else if ((phase === 'thinking' || phase === 'speaking') && this.turn && !this.turn.stopped) {
      // Maybe barge-in: only once the speech lasts (speaker echo is short).
      if (this.bargeTimer) clearTimeout(this.bargeTimer);
      this.bargeTimer = setTimeout(() => {
        this.bargeTimer = null;
        if (this.speechActive) this.confirmBargeIn();
      }, BARGE_IN_CONFIRM_MS);
      this.bargeTimer.unref?.();
    }
  }

  private onSpeechStopped(): void {
    if (this.ended) return;
    this.speechActive = false;
    if (this.bargeTimer) {
      // Too short to be the user: echo / a click.
      clearTimeout(this.bargeTimer);
      this.bargeTimer = null;
    }
    const capture = this.capture;
    if (!capture) return;
    capture.marks.endOfTurn = this.now();
    if (this.phase === 'hearing') this.setPhase('thinking', { turnId: capture.turnId });
  }

  private onDelta(itemId: string, text: string): void {
    if (this.ended || this.muted || this.phase === 'confirm') return;
    const capture = this.ensureCapture();
    const replyLive = (this.phase === 'thinking' || this.phase === 'speaking') && this.turn && !this.turn.stopped;
    if (replyLive) {
      if (!this.bargeTimer) {
        // Words of a sound that already ended under the barge-in threshold (speaker echo, a
        // click): keep them off the screen; the final transcript is judged in `onCompleted`.
        if (!capture.captions.has(itemId)) capture.order.push(itemId);
        capture.captions.set(itemId, (capture.captions.get(itemId) ?? '') + text);
        return;
      }
      // Still talking over the reply: the words confirm the barge-in early.
      clearTimeout(this.bargeTimer);
      this.bargeTimer = null;
      this.confirmBargeIn();
    }
    if (this.phase === 'listening') {
      this.clearIdle();
      this.setPhase('hearing', { turnId: capture.turnId });
    }
    if (!capture.captions.has(itemId)) capture.order.push(itemId);
    capture.captions.set(itemId, (capture.captions.get(itemId) ?? '') + text);
    const caption = capture.order.map((id) => capture.captions.get(id) ?? '').join(' ').replace(/\s+/g, ' ').trim();
    if (caption) this.deps.emit('voice:caption', { turnId: capture.turnId, text: caption, final: false });
  }

  private async onCompleted(itemId: string, raw: string, audio?: AgentVoiceTurnAudio): Promise<void> {
    if (this.ended) return;
    let text = cleanAgentVoiceTranscript(raw);
    const capture = this.capture;
    const live = this.turn && !this.turn.stopped && !this.turn.closed ? this.turn : null;
    if (text && live && (this.phase === 'thinking' || this.phase === 'speaking') && isAgentVoiceEcho(text, this.spokenText(live))) {
      // The reply is still playing, no barge-in fired, and the "words" are the reply itself.
      this.log(`[agent-voice] echo transcript dropped turn=${live.id} chars=${text.length}`);
      text = '';
    }
    if (!text) {
      if (capture) {
        capture.captions.delete(itemId);
        capture.order = capture.order.filter((id) => id !== itemId);
        if (capture.order.length === 0) {
          this.capture = null;
          // Nothing usable heard (and no live turn behind the "thinking" of this capture).
          if (this.phase === 'hearing' || (this.phase === 'thinking' && (!this.turn || this.turn.closed))) this.toListening();
        }
      }
      return;
    }
    if (this.muted || this.phase === 'confirm') {
      this.capture = null;
      return;
    }
    const current = capture ?? this.ensureCapture();
    this.capture = null;
    current.marks.endOfTurn ??= this.now();
    current.marks.transcriptFinal = this.now();
    const next = this.turnChain.then(async () => {
      let heard = text;
      if (audio && isImplausibleAgentVoiceTranscript(heard, audio.ms)) heard = await this.retranscribe(heard, audio);
      if (this.ended) return;
      if (!heard) {
        if (!this.capture && (this.phase === 'hearing' || (this.phase === 'thinking' && (!this.turn || this.turn.closed)))) this.toListening();
        return;
      }
      current.marks.transcriptFinal = this.now();
      await this.beginTurn(current, heard);
    });
    this.turnChain = next.catch((error) =>
      console.error('[agent-voice] turn failed', { sessionId: this.id, error: error instanceof Error ? error.message : 'unknown' }),
    );
    await this.turnChain;
  }

  /** What the turn has said so far (sentences whose text went out). */
  private spokenText(turn: Turn): string {
    return turn.items
      .filter((item) => item.textSent)
      .map((item) => item.text)
      .join(' ');
  }

  /**
   * The transcript is longer than its audio could hold: the model answered the request instead
   * of transcribing it (prompt-induced). Once more through the batch transcriber, without the
   * prompt. '' = no usable transcript.
   */
  private async retranscribe(text: string, audio: AgentVoiceTurnAudio): Promise<string> {
    const { providers, config } = this.deps;
    console.warn('[agent-voice] implausible transcript, retrying without prompt', { sessionId: this.id, chars: text.length, audioMs: Math.round(audio.ms) });
    const batch = providers.batch;
    if (!batch || !audio.pcm?.length) return '';
    try {
      const raw = await batch.transcribe({
        wav: pcmToWav(audio.pcm, AGENT_VOICE_INPUT_SAMPLE_RATE),
        prompt: '',
        signal: AbortSignal.timeout(config.timeoutMs),
      });
      void this.deps
        .recordUsage({ kind: 'batch_transcription', provider: batch.name, model: batch.model, amount: pcmDurationMs(audio.pcm.length, AGENT_VOICE_INPUT_SAMPLE_RATE) })
        .catch(() => {});
      const retried = cleanAgentVoiceTranscript(raw);
      return isImplausibleAgentVoiceTranscript(retried, audio.ms) ? '' : retried;
    } catch (error) {
      console.error('[agent-voice] re-transcription failed', { sessionId: this.id, error: error instanceof Error ? error.message : 'unknown' });
      return '';
    }
  }

  private confirmBargeIn(): void {
    const turn = this.turn;
    if (!turn || turn.stopped || turn.closed) return;
    if (this.phase !== 'thinking' && this.phase !== 'speaking') return;
    this.bargeIn(turn);
    const capture = this.ensureCapture();
    this.setPhase('hearing', { turnId: capture.turnId });
  }

  // --- turns -----------------------------------------------------------------------------------

  private nextTurnId(): string {
    this.turnSeq += 1;
    return `${this.id.slice(0, 8)}-${this.turnSeq}`;
  }

  private newTurn(id: string, marks: AgentVoiceTimings): Turn {
    return {
      id,
      marks: { ...marks },
      clientMarks: {},
      transcript: '',
      messageId: null,
      runId: null,
      feed: null,
      chunker: new SpeechChunker(),
      streamed: '',
      runDone: false,
      outcome: null,
      failure: null,
      pendingTitle: null,
      items: [],
      playIndex: 0,
      inFlight: 0,
      textSeq: 0,
      audioSeq: 0,
      audioBytes: 0,
      firstAudioAt: null,
      abort: new AbortController(),
      spokeReply: false,
      openTools: new Map(),
      fillers: 0,
      lastFillerAt: null,
      fillerTimer: null,
      audioEnded: false,
      playedMs: 0,
      playbackTimer: null,
      stopped: false,
      closed: false,
      speechFailed: false,
    };
  }

  private async beginTurn(capture: Capture, text: string): Promise<void> {
    if (this.ended) return;
    const previous = this.turn;
    if (previous && !previous.closed) this.bargeIn(previous);
    // The user went on talking before anything was said: one turn, re-sent over the first message.
    const before = this.continuable;
    this.continuable = null;
    const continuation = before ? { text: `${before.text} ${text}`.trim(), messageId: before.messageId } : null;

    const turn = this.newTurn(capture.turnId, capture.marks);
    turn.transcript = continuation?.text ?? text;
    this.turn = turn;
    this.flushSttUsage();
    this.deps.emit('voice:caption', { turnId: turn.id, text, final: true });
    this.setPhase('thinking', { turnId: turn.id });

    await this.pendingCancel;
    if (this.turn !== turn || turn.stopped || this.ended) return;
    const budget = await this.deps.checkBudget();
    if (this.turn !== turn || turn.stopped || this.ended) return;
    if (budget) {
      this.closeTurn(turn);
      this.error(budget, true);
      return;
    }

    let sent: { runId: string; messageId: string } | null = null;
    for (let attempt = 0; attempt < 2 && !sent; attempt += 1) {
      try {
        sent = await this.deps.runs.send({
          user: this.deps.user,
          chatId: this.deps.chatId,
          text: turn.transcript,
          locale: this.deps.locale,
          clientCaps: this.deps.clientCaps,
          editMessageId: continuation?.messageId ?? null,
          // Over the stopped turn's message, which already counted against the message quota.
          merged: Boolean(continuation?.messageId),
        });
      } catch (error) {
        const classified = this.deps.classifyError(error);
        // A run of this chat is still live (ours, cancelled a moment ago, or a typed one): cancel, retry once.
        if (classified.code === 'CHAT_BUSY' && attempt === 0 && previous?.runId) {
          await this.deps.runs.cancel(this.userId, previous.runId).catch(() => {});
          continue;
        }
        if (this.turn !== turn || this.ended) return;
        this.closeTurn(turn);
        const fatal = classified.code === 'BUDGET_EXCEEDED' || classified.code === 'NOT_FOUND';
        this.error(classified, fatal);
        if (!fatal) this.toListening();
        return;
      }
    }
    if (!sent) return;
    if (this.turn !== turn || turn.stopped || this.ended) {
      // Superseded while sending (the session ended: the run still answers in the chat).
      if (this.ended) return;
      // The user kept talking: the next turn re-sends this text with theirs, over this message.
      // (Set by the barge-in during the awaits above; TS narrowed the field to null.)
      const pending = this.continuable as Continuable | null;
      if (pending && pending.text === turn.transcript) pending.messageId = sent.messageId;
      const cancel = this.deps.runs.cancel(this.userId, sent.runId).catch(() => {});
      this.pendingCancel = this.pendingCancel.then(() => cancel);
      await cancel;
      return;
    }
    turn.runId = sent.runId;
    turn.messageId = sent.messageId;
    turn.marks.runQueued = this.now();
    this.seenRuns.add(sent.runId);
    this.deps.emit('voice:turn', { turnId: turn.id, runId: sent.runId, transcript: turn.transcript });
    this.setPhase('thinking', { turnId: turn.id, runId: sent.runId });
    const ok = await this.follow(turn);
    if (!ok && this.turn === turn) {
      this.closeTurn(turn);
      this.toListening();
    }
  }

  private async follow(turn: Turn): Promise<boolean> {
    if (!turn.runId) return false;
    try {
      const feed = await this.deps.runs.follow({
        userId: this.userId,
        chatId: this.deps.chatId,
        runId: turn.runId,
        onEvent: (event) => this.onRunEvent(turn, event),
        onEnd: () => {
          if (!turn.runDone && !turn.stopped) this.finishRun(turn, 'failed', null);
        },
      });
      if (!feed) return false;
      if (turn.closed || turn.stopped) feed.close();
      else turn.feed = feed;
      return true;
    } catch (error) {
      console.error('[agent-voice] follow failed', { runId: turn.runId, error: error instanceof Error ? error.message : 'unknown' });
      return false;
    }
  }

  private onRunEvent(turn: Turn, event: AgentStreamEvent): void {
    if (this.ended || turn.stopped || turn.closed || turn.runDone) return;
    switch (event.type) {
      case 'run.started':
        turn.marks.runStarted ??= this.now();
        break;
      case 'text.delta': {
        turn.marks.firstTextDelta ??= this.now();
        // Piece offsets index everything pushed to the chunker, i.e. `streamed`.
        turn.streamed += event.text;
        for (const piece of turn.chunker.pushPieces(event.text)) this.enqueueReply(turn, piece);
        break;
      }
      case 'tool.started':
        // Text before a tool call is complete ("Let me check."; voice runs stream it unheld):
        // say it now. Once it is queued the wait is covered and no filler follows.
        for (const piece of turn.chunker.flushPieces()) this.enqueueReply(turn, piece);
        turn.openTools.set(event.callId, event.label);
        this.scheduleFiller(turn);
        break;
      case 'tool.finished':
        turn.openTools.delete(event.callId);
        break;
      case 'action.pending':
        if (event.action.status === 'PENDING') turn.pendingTitle = event.action.preview.title;
        break;
      case 'run.completed':
        this.finishRun(turn, event.status === 'AWAITING_CONFIRMATION' ? 'confirm' : 'completed', null);
        break;
      case 'run.failed':
        this.finishRun(turn, 'failed', {
          code: event.code === 'BUDGET_EXCEEDED' ? 'BUDGET_EXCEEDED' : 'INTERNAL',
          message: event.message ?? undefined,
          ...(event.retryAt ? { retryAt: event.retryAt } : {}),
        });
        break;
      case 'run.cancelled':
        this.finishRun(turn, 'cancelled', null);
        break;
      default:
        break;
    }
  }

  private finishRun(turn: Turn, outcome: TurnOutcome, failure: AgentVoiceDepError | null): void {
    if (turn.runDone) return;
    for (const piece of turn.chunker.flushPieces()) this.enqueueReply(turn, piece);
    if (outcome === 'confirm' && !turn.spokeReply) {
      this.enqueueSpeech(turn, { kind: 'confirm', text: agentVoiceConfirmPrompt(this.deps.locale, turn.pendingTitle), rawStart: 0, rawEnd: 0 });
    }
    turn.runDone = true;
    turn.outcome = outcome;
    turn.failure = failure;
    if (turn.fillerTimer) clearTimeout(turn.fillerTimer);
    turn.fillerTimer = null;
    turn.feed?.close();
    turn.feed = null;
    this.pump(turn);
  }

  // --- speech ----------------------------------------------------------------------------------

  private enqueueReply(turn: Turn, piece: SpeechPiece): void {
    turn.marks.firstSentence ??= this.now();
    turn.spokeReply = true;
    this.enqueueSpeech(turn, { kind: 'reply', text: piece.text, rawStart: piece.rawStart, rawEnd: piece.rawEnd });
  }

  private enqueueSpeech(turn: Turn, input: { kind: SpeechItem['kind']; text: string; rawStart: number; rawEnd: number }): void {
    const text = normalizeAgentSpeechText(input.text);
    if (!text || turn.stopped) return;
    turn.items.push({
      ...input,
      text,
      seq: turn.textSeq++,
      bytesSent: 0,
      complete: false,
      chunks: [],
      textSent: false,
      failed: false,
      started: false,
    });
    this.startSynthesis(turn);
  }

  private startSynthesis(turn: Turn): void {
    while (turn.inFlight < MAX_TTS_IN_FLIGHT && !turn.stopped) {
      const item = turn.items.find((candidate) => !candidate.started);
      if (!item) return;
      item.started = true;
      turn.inFlight += 1;
      void this.synthesize(turn, item);
    }
  }

  private async synthesize(turn: Turn, item: SpeechItem): Promise<void> {
    const { config, providers } = this.deps;
    turn.marks.ttsRequested ??= this.now();
    const rechunker = new PcmRechunker(AUDIO_OUT_FRAME_BYTES);
    let received = 0;
    try {
      for await (const chunk of providers.tts.stream({
        text: item.text,
        model: config.ttsModel,
        voice: config.ttsVoice,
        instructions: config.ttsInstructions,
        signal: turn.abort.signal,
      })) {
        if (turn.stopped) break;
        turn.marks.firstTtsByte ??= this.now();
        received += chunk.length;
        item.chunks.push(...rechunker.push(chunk));
        if (item.chunks.length) this.pump(turn);
      }
      const rest = rechunker.flush();
      if (rest && !turn.stopped) item.chunks.push(rest);
    } catch (error) {
      if (!turn.stopped) {
        item.failed = true;
        console.error('[agent-voice] speech failed', { sessionId: this.id, error: error instanceof Error ? error.message : 'unknown' });
        if (!turn.speechFailed) {
          turn.speechFailed = true;
          this.error({ code: 'VOICE_UNAVAILABLE', message: 'Speech failed' }, false);
        }
      }
    } finally {
      item.complete = true;
      turn.inFlight -= 1;
      // Charged like v1: per spoken character of speech that was produced.
      if (received > 0) {
        void this.deps
          .recordUsage({ kind: 'speech', provider: providers.tts.name, model: config.ttsModel, amount: item.text.length })
          .catch(() => {});
      }
      if (!turn.stopped) {
        this.startSynthesis(turn);
        this.pump(turn);
      }
    }
  }

  /** Sends whatever is ready, strictly in order: an item's text, then its audio frames. */
  private pump(turn: Turn): void {
    if (turn.stopped || turn.closed || this.ended) return;
    while (turn.playIndex < turn.items.length) {
      const item = turn.items[turn.playIndex];
      if (!item.textSent && (item.chunks.length > 0 || (item.complete && !item.failed))) {
        item.textSent = true;
        this.deps.emit('voice:speech-text', { turnId: turn.id, seq: item.seq, kind: item.kind, text: item.text });
      }
      while (item.chunks.length > 0) {
        const pcm = item.chunks.shift()!;
        if (turn.firstAudioAt == null) {
          turn.firstAudioAt = this.now();
          turn.marks.firstAudioOutSent = turn.firstAudioAt;
          this.setPhase('speaking', { turnId: turn.id, ...(turn.runId ? { runId: turn.runId } : {}) });
        }
        item.bytesSent += pcm.length;
        turn.audioBytes += pcm.length;
        this.deps.emit('voice:audio-out', { turnId: turn.id, seq: turn.audioSeq++, pcm: pcm as unknown as ArrayBuffer });
      }
      if (!item.complete) return;
      turn.playIndex += 1;
    }
    if (turn.runDone && !turn.audioEnded) this.endAudio(turn);
  }

  private endAudio(turn: Turn): void {
    turn.audioEnded = true;
    this.deps.emit('voice:audio-end', { turnId: turn.id });
    this.deps.emit('voice:timing', { turnId: turn.id, marks: { ...turn.marks } });
    if (turn.audioBytes === 0) {
      this.afterPlayback(turn);
      return;
    }
    const audioMs = pcmDurationMs(turn.audioBytes, AGENT_VOICE_OUTPUT_SAMPLE_RATE);
    const elapsed = this.now() - (turn.firstAudioAt ?? this.now());
    turn.playbackTimer = setTimeout(() => this.afterPlayback(turn), Math.max(0, audioMs - elapsed) + PLAYBACK_GRACE_MS);
    turn.playbackTimer.unref?.();
  }

  /** The turn's audio was played: confirm card, error notice or listening. */
  private afterPlayback(turn: Turn): void {
    if (turn.closed || this.turn !== turn || this.ended) return;
    this.closeTurn(turn);
    if (turn.outcome === 'confirm') {
      this.stt?.clear();
      this.speechActive = false;
      this.capture = null;
      this.clearIdle();
      this.setPhase('confirm', { turnId: turn.id, ...(turn.runId ? { runId: turn.runId } : {}), ...(turn.pendingTitle ? { confirmTitle: turn.pendingTitle } : {}) });
      return;
    }
    if (turn.outcome === 'failed' && turn.failure) {
      const fatal = turn.failure.code === 'BUDGET_EXCEEDED';
      this.error(turn.failure, fatal);
      if (fatal) return;
    }
    // The user may already be talking again (captured meanwhile).
    if (this.phase !== 'hearing') this.toListening();
  }

  // --- fillers ---------------------------------------------------------------------------------

  private scheduleFiller(turn: Turn): void {
    if (turn.spokeReply || turn.fillers >= MAX_FILLERS_PER_TURN || turn.fillerTimer) return;
    const eot = turn.marks.endOfTurn ?? turn.marks.transcriptFinal ?? turn.marks.runQueued ?? this.now();
    const dueAt =
      turn.fillers === 0 ? eot + this.deps.config.realtime.fillerDelayMs : (turn.lastFillerAt ?? this.now()) + SECOND_FILLER_AFTER_MS;
    turn.fillerTimer = setTimeout(() => {
      turn.fillerTimer = null;
      this.speakFiller(turn);
    }, Math.max(0, dueAt - this.now()));
    turn.fillerTimer.unref?.();
  }

  private speakFiller(turn: Turn): void {
    if (turn.stopped || turn.closed || turn.runDone || turn.spokeReply || turn.openTools.size === 0) return;
    if (turn.items.some((item) => !item.complete)) return;
    const label = [...turn.openTools.values()].at(-1)?.trim();
    if (!label) return;
    turn.fillers += 1;
    turn.lastFillerAt = this.now();
    this.enqueueSpeech(turn, { kind: 'progress', text: /[.!?…。]$/u.test(label) ? label : `${label}…`, rawStart: 0, rawEnd: 0 });
    // A step that keeps going gets one more (≥ 4 s later).
    this.scheduleFiller(turn);
  }

  // --- barge-in --------------------------------------------------------------------------------

  /** Stop the turn's speech, cancel its run if live, cut the stored reply to what was heard. */
  private bargeIn(turn: Turn): void {
    if (turn.stopped) return;
    const hadAudio = turn.audioBytes > 0;
    this.stopTurnAudio(turn);
    if (hadAudio) this.deps.emit('voice:stop-playback', { turnId: turn.id });
    const runId = turn.runId;
    const runLive = Boolean(runId) && !turn.runDone;
    if (turn.transcript && turn.audioBytes === 0 && turn.items.length === 0 && !turn.runDone) {
      this.continuable = { text: turn.transcript, messageId: turn.messageId };
    }
    const heardOffset = heardReplyOffset(turn.items, turn.playedMs, turn.streamed);
    // Reply text the user did not hear (or the run is still writing): cut the stored reply.
    const cut = runLive || heardOffset < turn.streamed.trimEnd().length;
    this.closeTurn(turn);
    const work = (async () => {
      if (runId && runLive) await this.deps.runs.cancel(this.userId, runId);
      if (runId && cut && turn.streamed.trim()) await this.deps.runs.truncateReply({ runId, streamedText: turn.streamed, heardOffset });
    })();
    this.pendingCancel = work.catch((error) =>
      console.error('[agent-voice] barge-in cleanup failed', { runId, error: error instanceof Error ? error.message : 'unknown' }),
    );
  }

  private stopTurnAudio(turn: Turn): void {
    turn.stopped = true;
    turn.abort.abort();
    if (turn.fillerTimer) clearTimeout(turn.fillerTimer);
    if (turn.playbackTimer) clearTimeout(turn.playbackTimer);
    turn.fillerTimer = null;
    turn.playbackTimer = null;
    for (const item of turn.items) item.chunks = [];
  }

  private closeTurn(turn: Turn): void {
    if (turn.closed) return;
    turn.closed = true;
    turn.feed?.close();
    turn.feed = null;
    if (turn.fillerTimer) clearTimeout(turn.fillerTimer);
    if (turn.playbackTimer) clearTimeout(turn.playbackTimer);
    turn.fillerTimer = null;
    turn.playbackTimer = null;
    this.logTurn(turn);
  }

  // --- gaps, idle, state -----------------------------------------------------------------------

  /** The client stopped streaming while the provider has speech open: pad silence so the turn can end. */
  private fillGap(): void {
    if (this.ended || this.suspended || !this.stt || !this.speechActive || this.muted || this.phase === 'confirm') return;
    const quietMs = this.now() - this.lastFrameAt;
    if (quietMs < GAP_FILL_AFTER_MS || this.gapFilledMs >= GAP_FILL_MAX_MS) return;
    this.gapFilledMs += GAP_FILL_TICK_MS;
    this.stt.append(Buffer.alloc(Math.round(GAP_FILL_TICK_MS * pcmBytesPerMs(AGENT_VOICE_INPUT_SAMPLE_RATE))));
  }

  private toListening(): void {
    if (this.ended) return;
    this.continuable = null;
    this.setPhase('listening');
    this.armIdle();
  }

  private armIdle(): void {
    this.clearIdle();
    // Suspended: the namespace's grace timer decides; `resumeTransport` re-arms.
    if (this.suspended) return;
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      if (this.phase === 'listening') this.end('idle');
    }, this.deps.config.realtime.idleMs);
    this.idleTimer.unref?.();
  }

  private clearIdle(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  private setPhase(phase: AgentVoicePhase, extra: Omit<AgentVoiceStatePayload, 'phase'> = {}): void {
    if (this.ended) return;
    const changed = phase !== this.phase;
    this.phase = phase;
    if (phase !== 'listening') this.clearIdle();
    if (changed || extra.turnId || extra.runId) {
      this.lastState = { phase, ...extra };
      this.deps.emit('voice:state', { phase, ...extra });
    }
  }

  private error(error: AgentVoiceDepError, fatal: boolean): void {
    if (this.ended) return;
    this.deps.emit('voice:error', { code: error.code, ...(error.message ? { message: error.message } : {}), fatal, ...(error.retryAt ? { retryAt: error.retryAt } : {}) });
    if (fatal) this.end('error');
  }

  private flushSttUsage(): void {
    const stt = this.stt;
    this.sttBilledSince = this.now();
    if (!stt) return;
    const ms = stt.takeBilledMs();
    if (ms <= 0) return;
    void this.deps
      .recordUsage({ kind: stt.kind === 'realtime' ? 'realtime_transcription' : 'batch_transcription', provider: stt.provider, model: stt.model, amount: ms })
      .catch(() => {});
  }

  private logTurn(turn: Turn): void {
    const m = turn.marks;
    const c = turn.clientMarks;
    if (m.transcriptFinal == null) return;
    const span = (from: number | undefined, to: number | undefined) => (from != null && to != null ? `${Math.round(to - from)}ms` : '-');
    const totalEnd = c.playbackStart ?? m.firstAudioOutSent;
    this.log(
      `[agent-voice] turn=${turn.id} run=${turn.runId ?? '-'} eot→final=${span(m.endOfTurn, m.transcriptFinal)} ` +
        `final→runStarted=${span(m.transcriptFinal, m.runStarted)} →firstDelta=${span(m.runStarted, m.firstTextDelta)} ` +
        `→firstTtsByte=${span(m.firstTextDelta ?? m.runStarted, m.firstTtsByte)} →firstAudioOut=${span(m.firstTtsByte, m.firstAudioOutSent)} ` +
        `→playback=${span(m.firstAudioOutSent, c.playbackStart)} total=${span(m.endOfTurn ?? m.transcriptFinal, totalEnd)} ` +
        `outcome=${turn.stopped ? 'interrupted' : (turn.outcome ?? '-')} stt=${this.stt?.kind ?? '-'}`,
    );
  }
}
