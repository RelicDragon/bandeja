import {
  AGENT_VOICE_FRAME_MS,
  AGENT_VOICE_INPUT_SAMPLE_RATE,
  AGENT_VOICE_OUTPUT_SAMPLE_RATE,
  type AgentVoiceCaptionPayload,
  type AgentVoiceErrorCode,
  type AgentVoiceErrorPayload,
  type AgentVoiceAudioOutPayload,
  type AgentVoicePhase as ServerVoicePhase,
  type AgentVoiceSpeechTextPayload,
  type AgentVoiceStartAck,
  type AgentVoiceStartPayload,
  type AgentVoiceStatePayload,
  type AgentVoiceTimings,
  type AgentVoiceTurnPayload,
} from '@shared/agentVoiceRealtime';
import type { AgentVoiceCloseReason, AgentVoiceNotice } from './agentVoiceSession';
import type { AgentVoiceConnection, AgentVoiceTransport } from './agentVoiceRealtimeTransport';
import {
  INITIAL_VOICE_VIEW_STATE,
  type AgentVoicePlaybackPosition,
  type AgentVoiceReply,
  type AgentVoiceViewState,
} from './agentVoiceViewState';
import { PcmFramer, StreamResampler, floatToPcm16 } from './pcm16';
import { PcmStreamPlayer } from './pcmStreamPlayer';
import type { RealtimeVoiceEngine } from './voiceAudioEngine';
import { VoiceUploadGate } from './voiceUploadGate';

/**
 * One realtime voice conversation (v2, `@shared/agentVoiceRealtime`; docs/domains/agent.md § Voice).
 * The server owns the turn loop (streaming transcription, end of turn, the run, sentence
 * chunking, TTS); this side streams the mic, plays the reply and mirrors the server's phase:
 *
 *   listening ─speech─▶ hearing ─end of turn─▶ thinking ─audio─▶ speaking ─played─▶ listening
 *       ▲                                                                │ run awaits a confirmation
 *       └──────────── Confirm (follow-run) / Reject / orb (resume) ◀─ confirm
 *
 * - Upload: 24 kHz PCM16 in 20 ms frames, gated by a lenient local VAD (`VoiceUploadGate`);
 *   always on while hearing (the server ends the turn); while thinking / speaking only voice
 *   (pre-roll + a short tail), enough for the server's barge-in without paying for silence.
 * - Playback: `PcmStreamPlayer`, gapless and in order per turn; progress reported every 250 ms.
 * - Local barge-in: the engine's strict barge-in VAD while speaking, or the orb → flush +
 *   `voice:interrupt {turnId, playedMs}`.
 * - Cards and Confirm still come from the chat's SSE attachment; ending never cancels a run.
 * - Reconnect: `voice:start {resumeSessionId}`; the server keeps the session for a short grace
 *   (ack `resumed`: same session, it re-sends `voice:state`), else this is a fresh session.
 * - `onFallback`: v2 can't continue (refused after a reconnect, gave up): the controller
 *   carries on with the v1 loop on the same, still running engine.
 */

export interface AgentVoiceRealtimeSessionDeps {
  transport: AgentVoiceTransport;
  /** Started by the controller (inside the user's tap). */
  engine: RealtimeVoiceEngine;
  /** Until `activate` brings the ack's rate. */
  outputSampleRate?: number;
  /** `voice:start` payload for a restart after a reconnect. */
  startPayload: (muted: boolean) => AgentVoiceStartPayload;
  onClose: (reason: AgentVoiceCloseReason, notice: AgentVoiceNotice | null) => void;
  onFallback: () => void;
  /** A turn became a run: the chat attaches it and loads the stored user message. */
  onTurn?: (turn: AgentVoiceTurnPayload) => void;
  /**
   * The reply was cut (barge-in, orb, server stop): the server truncates the stored reply to what
   * was heard after the SSE stream already ended, so the chat refetches its messages.
   */
  onReplyCut?: () => void;
  /**
   * Quiet listening this long ends the session (the server has its own idle end too). Default:
   * the server's `idleMs` (start ack) + 15 s, or 120 s when the server doesn't say.
   */
  idleTimeoutMs?: number;
  restartTimeoutMs?: number;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

const REPORT_INTERVAL_MS = 250;
const DEFAULT_IDLE_TIMEOUT_MS = 120_000;
/** The local idle end is a backstop: it fires this long after the server's own. */
const IDLE_BACKSTOP_MARGIN_MS = 15_000;
const DEFAULT_RESTART_TIMEOUT_MS = 3_000;
const MAX_REPLY_LINES = 8;
const MAX_TIMED_TURNS = 8;

/** Error code → dock notice. VOICE_V2_UNAVAILABLE never shows: it means "use v1". */
export const VOICE_ERROR_NOTICE: Record<AgentVoiceErrorCode, AgentVoiceNotice | null> = {
  VOICE_V2_UNAVAILABLE: null,
  VOICE_UNAVAILABLE: 'unavailable',
  BUDGET_EXCEEDED: 'budget',
  RATE_LIMITED: 'rateLimited',
  CHAT_BUSY: 'chatBusy',
  NOT_FOUND: 'runFailed',
  BAD_REQUEST: 'runFailed',
  INTERNAL: 'runFailed',
};

export function isFallbackAck(ack: AgentVoiceStartAck): boolean {
  if (ack.ok) return false;
  // Server-side trouble starting v2 → the v1 loop may still work; a limit or busy chat won't.
  return ack.code === 'VOICE_V2_UNAVAILABLE' || ack.code === 'INTERNAL' || ack.code === 'BAD_REQUEST' || ack.code === 'NOT_FOUND';
}

export class AgentVoiceRealtimeSession {
  private state: AgentVoiceViewState = { ...INITIAL_VOICE_VIEW_STATE, phase: 'listening', transport: 'v2' };
  private readonly listeners = new Set<() => void>();
  private player: PcmStreamPlayer;
  private readonly gate = new VoiceUploadGate({ frameMs: AGENT_VOICE_FRAME_MS });
  private readonly framer = new PcmFramer((AGENT_VOICE_INPUT_SAMPLE_RATE * AGENT_VOICE_FRAME_MS) / 1000);
  private resampler: StreamResampler | null = null;
  private gateIdle = false;
  private closed = false;
  /** Latest phase the server sent (the local phase stays `speaking` while audio still plays). */
  private serverPhase: ServerVoicePhase = 'listening';
  private turnId: string | null = null;
  /** The server session (sent as `resumeSessionId` after a reconnect). */
  private sessionId: string | null = null;
  /** The server's idle end (`idleMs` of the start ack), when it said. */
  private serverIdleMs: number | null = null;
  private confirmRunId: string | null = null;
  private readonly knownRuns = new Set<string>();
  private reportTimer: unknown = null;
  private readonly reportedDone = new Set<string>();
  private idleTimer: unknown = null;
  /** Client marks of the speech that is about to become a turn (id not known yet). */
  private clientMarks: AgentVoiceTimings | null = null;
  private awaitingFirstAudio = false;
  private readonly timings = new Map<string, AgentVoiceTimings>();
  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;

  constructor(private readonly deps: AgentVoiceRealtimeSessionDeps) {
    this.now = deps.now ?? (() => Date.now());
    this.setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = deps.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
    this.player = new PcmStreamPlayer(deps.engine, deps.outputSampleRate ?? AGENT_VOICE_OUTPUT_SAMPLE_RATE);
    const { transport } = deps;
    transport.on('voice:state', (p) => this.onServerState(p));
    transport.on('voice:caption', (p) => this.onCaption(p));
    transport.on('voice:turn', (p) => this.onTurn(p));
    transport.on('voice:speech-text', (p) => this.onSpeechText(p));
    transport.on('voice:audio-out', (p) => this.onAudioOut(p));
    transport.on('voice:audio-end', (p) => {
      this.player.end(p.turnId);
      this.ensureReporting();
    });
    transport.on('voice:stop-playback', (p) => this.onStopPlayback(p.turnId));
    transport.on('voice:error', (p) => this.onError(p));
    transport.on('voice:timing', (p) => this.mergeTimings(p.turnId, p.marks));
    transport.onConnection((c) => this.onConnection(c));
  }

  /** The controller got `{ok: true}`: take over the engine and listen. */
  activate(outputSampleRate: number = AGENT_VOICE_OUTPUT_SAMPLE_RATE, sessionId?: string, serverIdleMs?: number): void {
    if (this.closed) return;
    this.sessionId = sessionId ?? null;
    this.noteServerIdle(serverIdleMs);
    if (outputSampleRate !== this.player.sampleRate && this.player.turnId == null) {
      this.player = new PcmStreamPlayer(this.deps.engine, outputSampleRate);
    }
    const { engine } = this.deps;
    engine.setHandlers({
      onSpeechStart: () => this.onLocalBargeIn(),
      onSpeechDiscard: () => {},
      onUtterance: () => {},
      onInterrupted: () => this.stop('interrupted'),
    });
    engine.setFrameSink((frame, sampleRate, db) => this.onFrame(frame, sampleRate, db));
    this.applyListening();
    if (this.state.phase === 'listening') this.armIdle();
  }

  // --- store -----------------------------------------------------------------------------------

  getState = (): AgentVoiceViewState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  levels(): { input: number; output: number } {
    return this.deps.engine.levels();
  }

  playbackPosition(): AgentVoicePlaybackPosition | null {
    const turnId = this.player.turnId;
    if (!turnId || this.player.startTime == null) return null;
    return {
      turnId,
      playedMs: this.player.playedMs(),
      receivedMs: this.player.receivedMs(),
      complete: this.player.complete,
    };
  }

  get active(): boolean {
    return !this.closed && this.state.phase !== 'off';
  }

  private set(patch: Partial<AgentVoiceViewState>): void {
    let changed = false;
    for (const key of Object.keys(patch) as (keyof AgentVoiceViewState)[]) {
      if (patch[key] !== this.state[key]) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  // --- user ------------------------------------------------------------------------------------

  stop(reason: AgentVoiceCloseReason = 'user'): void {
    this.close(reason, reason === 'interrupted' ? 'interrupted' : null);
  }

  toggleMute(): void {
    if (!this.active) return;
    const muted = !this.state.muted;
    this.deps.transport.emit('voice:mute', { muted });
    this.set({ muted });
    this.applyListening();
    if (muted) this.clearIdle();
    else if (this.state.phase === 'listening') this.armIdle();
  }

  /** The orb. Speaking / thinking: interrupt. Confirm: listen again. Muted: unmute. */
  tap(): void {
    if (!this.active) return;
    if (this.state.muted) {
      this.toggleMute();
      return;
    }
    const { phase } = this.state;
    if (phase === 'speaking' || phase === 'thinking') this.interrupt('listening');
    else if (phase === 'confirm') this.resume();
  }

  // --- chat → session --------------------------------------------------------------------------

  /**
   * A live run of the chat. Runs of voice turns are the server's own; any other run that starts
   * while waiting (the Confirm follow-up, a card tapped mid-conversation) is spoken via `follow-run`.
   */
  followRun(runId: string): void {
    if (!this.active || this.knownRuns.has(runId)) return;
    const { phase } = this.state;
    if (phase !== 'confirm' && phase !== 'listening') return;
    this.knownRuns.add(runId);
    this.confirmRunId = null;
    this.deps.transport.emit('voice:follow-run', { runId });
    this.clearIdle();
    this.serverPhase = 'thinking';
    this.set({ phase: 'thinking', confirmTitle: null, notice: null, progress: null });
    this.applyListening();
  }

  /** In `confirm`, once no card is pending and nothing runs (Reject, Confirm without follow-up): resume. */
  syncChat(chat: { pendingAction: boolean; running: boolean }): void {
    if (this.state.phase === 'confirm' && !chat.pendingAction && !chat.running) this.resume();
  }

  private resume(): void {
    this.confirmRunId = null;
    this.deps.transport.emit('voice:resume', {});
    this.serverPhase = 'listening';
    this.set({ phase: 'listening', confirmTitle: null, notice: null });
    this.applyListening();
    this.armIdle();
  }

  // --- mic -------------------------------------------------------------------------------------

  private onFrame(frame: Float32Array, sampleRate: number, db: number): void {
    if (!this.active) return;
    const { phase, muted } = this.state;
    if (muted || phase === 'confirm') {
      if (!this.gateIdle) this.gate.reset();
      this.gateIdle = true;
      return;
    }
    this.gateIdle = false;
    if (!this.resampler || this.resampler.inRate !== sampleRate) {
      this.resampler = new StreamResampler(sampleRate, AGENT_VOICE_INPUT_SAMPLE_RATE);
    }
    const force = phase === 'hearing';
    const replyTail = phase === 'thinking' || phase === 'speaking';
    for (const out of this.framer.push(floatToPcm16(this.resampler.process(frame)))) {
      const { chunks, voiceStarted } = this.gate.push(out, db, force, replyTail);
      if (voiceStarted && this.state.phase === 'listening') {
        this.clientMarks = { speechStart: this.now() };
        this.awaitingFirstAudio = true;
        this.clearIdle();
      }
      for (const chunk of chunks) {
        this.deps.transport.sendAudio(chunk);
        if (this.awaitingFirstAudio && this.clientMarks) {
          this.clientMarks.firstAudioSent = this.now();
          this.awaitingFirstAudio = false;
        }
      }
    }
    // Speech the server didn't take as a turn: the idle clock runs again once the gate closes.
    if (this.state.phase === 'listening' && this.idleTimer == null && !this.gate.sending) this.armIdle();
  }

  /** The engine's strict barge-in VAD fired (it only runs while the reply plays). */
  private onLocalBargeIn(): void {
    if (this.state.phase === 'speaking' && !this.state.muted) this.interrupt('hearing');
  }

  private interrupt(next: 'listening' | 'hearing'): void {
    const turnId = this.player.turnId ?? this.turnId ?? undefined;
    const playing = this.player.turnId != null && this.player.startTime != null;
    const playedMs = playing ? this.player.playedMs() : undefined;
    if (this.player.turnId) {
      this.reportedDone.add(this.player.turnId);
      this.player.retire(this.player.turnId);
    }
    this.deps.transport.emit('voice:interrupt', {
      ...(turnId ? { turnId } : {}),
      ...(playedMs != null ? { playedMs } : {}),
    });
    this.deps.onReplyCut?.();
    this.serverPhase = next;
    this.set({ phase: next, agentCaption: null, progress: null, notice: null });
    this.applyListening();
    if (next === 'listening') this.armIdle();
  }

  // --- server → session ------------------------------------------------------------------------

  private onServerState(p: AgentVoiceStatePayload): void {
    if (this.closed) return;
    if (p.runId) this.knownRuns.add(p.runId);
    if (p.turnId) this.noteTurn(p.turnId);
    this.serverPhase = p.phase;
    switch (p.phase) {
      case 'ended':
        this.onServerEnded(p.reason);
        return;
      case 'confirm':
        // The spoken confirm prompt may still be playing: it plays out, the mic is off.
        this.confirmRunId = p.runId ?? null;
        this.clearIdle();
        this.set({ phase: 'confirm', confirmTitle: p.confirmTitle ?? null, progress: null, agentCaption: null });
        break;
      case 'listening': {
        // The reply's tail may still be playing: the dock says "speaking" until it has.
        if (this.player.playing) break;
        const caption = this.state.liveCaption;
        this.set({
          phase: 'listening',
          progress: null,
          confirmTitle: null,
          agentCaption: null,
          // A partial caption that never became a turn (noise, nothing said) goes away.
          liveCaption: caption && caption.runId ? caption : null,
        });
        this.armIdle();
        break;
      }
      case 'hearing':
        this.clearIdle();
        this.set({ phase: 'hearing', notice: null });
        break;
      case 'thinking':
        this.clearIdle();
        this.set({ phase: 'thinking', notice: null });
        break;
      case 'speaking':
        this.clearIdle();
        this.set({ phase: 'speaking' });
        break;
    }
    this.applyListening();
  }

  private onServerEnded(reason: AgentVoiceStatePayload['reason']): void {
    switch (reason) {
      case 'idle':
        this.close('idle', null);
        break;
      case 'max_duration':
        this.close('idle', 'maxDuration');
        break;
      case 'replaced':
        this.close('interrupted', 'replaced');
        break;
      case 'error':
        this.close('error', this.state.notice ?? 'runFailed');
        break;
      default:
        this.close('user', null);
    }
  }

  private onCaption(p: AgentVoiceCaptionPayload): void {
    if (this.closed) return;
    this.noteTurn(p.turnId);
    const prev = this.state.liveCaption;
    const runId = prev && prev.turnId === p.turnId ? prev.runId : null;
    this.set({ liveCaption: { turnId: p.turnId, text: p.text, final: p.final, runId }, userCaption: p.text });
  }

  private onTurn(p: AgentVoiceTurnPayload): void {
    if (this.closed) return;
    this.noteTurn(p.turnId);
    this.knownRuns.add(p.runId);
    const reply: AgentVoiceReply | null = this.state.reply?.turnId === p.turnId ? this.state.reply : { turnId: p.turnId, lines: [], activeSeq: null };
    this.set({
      liveCaption: { turnId: p.turnId, text: p.transcript, final: true, runId: p.runId },
      userCaption: p.transcript,
      reply,
    });
    this.deps.onTurn?.(p);
  }

  private onSpeechText(p: AgentVoiceSpeechTextPayload): void {
    if (this.closed) return;
    if (p.kind === 'progress') {
      this.set({ progress: p.text });
      return;
    }
    const line = { seq: p.seq, kind: p.kind, text: p.text, startMs: this.player.receivedMs(p.turnId) };
    const prev = this.state.reply;
    const lines = prev && prev.turnId === p.turnId ? [...prev.lines, line].slice(-MAX_REPLY_LINES) : [line];
    this.set({ reply: { turnId: p.turnId, lines, activeSeq: prev && prev.turnId === p.turnId ? prev.activeSeq : null } });
  }

  private onAudioOut(p: AgentVoiceAudioOutPayload): void {
    if (this.closed) return;
    if (!this.player.push(p.turnId, p.seq, p.pcm)) return;
    const timed = this.timings.get(p.turnId);
    const start = this.player.startTime;
    if (start != null && !timed?.playbackStart) {
      const at = Math.round(this.now() + Math.max(0, start - this.deps.engine.currentTime()) * 1000);
      this.mergeTimings(p.turnId, { playbackStart: at });
      this.deps.transport.emit('voice:timing', { turnId: p.turnId, marks: { playbackStart: at } });
    }
    if (this.state.phase !== 'speaking' && this.state.phase !== 'confirm') {
      this.clearIdle();
      this.set({ phase: 'speaking' });
      this.applyListening();
    }
    this.ensureReporting();
  }

  private onStopPlayback(turnId: string): void {
    if (this.closed) return;
    if (this.player.turnId === turnId && !this.reportedDone.has(turnId)) {
      this.deps.transport.emit('voice:playback', { turnId, playedMs: this.player.playedMs(), done: false });
    }
    this.reportedDone.add(turnId);
    this.player.retire(turnId);
    this.set({ agentCaption: null });
    this.deps.onReplyCut?.();
  }

  private onError(p: AgentVoiceErrorPayload): void {
    if (this.closed) return;
    if (p.code === 'VOICE_V2_UNAVAILABLE') {
      if (p.fatal) this.fallback();
      return;
    }
    const notice = VOICE_ERROR_NOTICE[p.code];
    if (p.fatal) this.close('error', notice ?? 'runFailed');
    // Non-fatal VOICE_UNAVAILABLE = one TTS call failed: the text is still in the chat.
    else this.set({ notice: p.code === 'VOICE_UNAVAILABLE' ? 'speechFailed' : notice });
  }

  private async onConnection(connection: AgentVoiceConnection): Promise<void> {
    if (this.closed) return;
    if (connection === 'reconnecting') {
      this.set({ reconnecting: true });
      return;
    }
    if (connection === 'lost') {
      this.fallback();
      return;
    }
    // Back online: resume the server's session (held for a short grace), else a new one.
    const ack = await this.deps.transport.start(
      { ...this.deps.startPayload(this.state.muted), ...(this.sessionId ? { resumeSessionId: this.sessionId } : {}) },
      this.deps.restartTimeoutMs ?? DEFAULT_RESTART_TIMEOUT_MS,
    );
    if (this.closed) return;
    if (ack.ok && ack.resumed) {
      // Same session and turn; reply audio sent while offline is gone, so the playing turn
      // stops here (reported as played out). The server re-sends its phase.
      const playingTurn = this.player.turnId;
      if (playingTurn && !this.reportedDone.has(playingTurn)) {
        this.deps.transport.emit('voice:playback', { turnId: playingTurn, playedMs: this.player.playedMs(), done: true });
        this.reportedDone.add(playingTurn);
      }
      this.player.flush();
      this.set({ reconnecting: false, agentCaption: null });
      return;
    }
    if (ack.ok) {
      this.sessionId = ack.sessionId;
      this.noteServerIdle(ack.idleMs);
      this.player.flush();
      this.serverPhase = 'listening';
      this.set({ reconnecting: false, phase: this.state.phase === 'confirm' ? 'confirm' : 'listening', progress: null, agentCaption: null });
      this.applyListening();
      return;
    }
    if (isFallbackAck(ack)) this.fallback();
    else this.close('error', VOICE_ERROR_NOTICE[ack.code] ?? 'runFailed');
  }

  // --- playback progress -----------------------------------------------------------------------

  private ensureReporting(): void {
    if (this.reportTimer != null || this.closed) return;
    this.reportTimer = this.setTimer(() => this.report(), REPORT_INTERVAL_MS);
  }

  private report(): void {
    this.reportTimer = null;
    if (this.closed) return;
    const turnId = this.player.turnId;
    if (!turnId) return;
    const playedMs = this.player.playedMs();
    const done = this.player.done;
    if (!this.reportedDone.has(turnId)) {
      this.deps.transport.emit('voice:playback', { turnId, playedMs, done });
      if (done) this.reportedDone.add(turnId);
    }
    this.updateKaraoke(turnId, playedMs);
    if (!done) {
      this.ensureReporting();
      return;
    }
    // Played out: catch up with the phase the server moved to meanwhile.
    if (this.state.phase === 'speaking' && this.serverPhase !== 'speaking') {
      const phase = this.serverPhase === 'ended' ? 'listening' : this.serverPhase;
      this.set({ phase, agentCaption: null, progress: null });
      this.applyListening();
      if (phase === 'listening') this.armIdle();
    }
  }

  private updateKaraoke(turnId: string, playedMs: number): void {
    const reply = this.state.reply;
    if (!reply || reply.turnId !== turnId || reply.lines.length === 0) return;
    let active: (typeof reply.lines)[number] | null = null;
    for (const line of reply.lines) if (line.startMs <= playedMs) active = line;
    if (!active || active.seq === reply.activeSeq) return;
    this.set({ reply: { ...reply, activeSeq: active.seq }, agentCaption: active.text, progress: null });
  }

  // --- timings ---------------------------------------------------------------------------------

  /** A server event names the current turn: the pending client marks belong to it. */
  private noteTurn(turnId: string): void {
    if (this.turnId === turnId) return;
    this.turnId = turnId;
    const marks = this.clientMarks;
    this.clientMarks = null;
    this.awaitingFirstAudio = false;
    if (!marks) return;
    this.mergeTimings(turnId, marks);
    this.deps.transport.emit('voice:timing', { turnId, marks });
  }

  private mergeTimings(turnId: string, marks: AgentVoiceTimings): void {
    const merged = { ...this.timings.get(turnId), ...marks };
    this.timings.delete(turnId);
    this.timings.set(turnId, merged);
    while (this.timings.size > MAX_TIMED_TURNS) {
      const oldest = this.timings.keys().next().value;
      if (oldest === undefined) break;
      this.timings.delete(oldest);
    }
    if (this.closed) return;
    const shown = this.state.timings;
    if (!shown || shown.turnId === turnId || turnId === this.turnId) this.set({ timings: { turnId, marks: merged } });
  }

  // --- listening / lifecycle -------------------------------------------------------------------

  private applyListening(): void {
    const { phase, muted } = this.state;
    const { engine } = this.deps;
    if (muted || phase === 'confirm') engine.setListening('off');
    // The engine's VAD only matters for the local barge-in; otherwise it just meters the mic.
    else if (phase === 'speaking') engine.setListening('bargeIn');
    else engine.setListening('normal');
  }

  private noteServerIdle(idleMs: number | undefined): void {
    if (typeof idleMs === 'number' && Number.isFinite(idleMs) && idleMs > 0) this.serverIdleMs = idleMs;
  }

  private idleTimeoutMs(): number {
    if (this.deps.idleTimeoutMs != null) return this.deps.idleTimeoutMs;
    return this.serverIdleMs != null ? this.serverIdleMs + IDLE_BACKSTOP_MARGIN_MS : DEFAULT_IDLE_TIMEOUT_MS;
  }

  private armIdle(): void {
    this.clearIdle();
    if (this.state.muted) return;
    this.idleTimer = this.setTimer(() => {
      this.idleTimer = null;
      if (this.state.phase === 'listening' && !this.gate.sending) this.stop('idle');
    }, this.idleTimeoutMs());
  }

  private clearIdle(): void {
    if (this.idleTimer != null) this.clearTimer(this.idleTimer);
    this.idleTimer = null;
  }

  private teardown(): void {
    this.closed = true;
    this.clearIdle();
    if (this.reportTimer != null) this.clearTimer(this.reportTimer);
    this.reportTimer = null;
    this.player.flush();
    this.deps.engine.setFrameSink(null);
    this.deps.transport.close();
  }

  /** v2 can't go on: hand the running engine to the controller's v1 loop. */
  private fallback(): void {
    if (this.closed) return;
    this.teardown();
    this.deps.onFallback();
  }

  private close(reason: AgentVoiceCloseReason, notice: AgentVoiceNotice | null): void {
    if (this.closed) return;
    this.teardown();
    this.deps.engine.stop();
    this.state = { ...INITIAL_VOICE_VIEW_STATE, notice };
    for (const listener of this.listeners) listener();
    this.deps.onClose(reason, notice);
  }

  /** Never activated (the start ack said no): drop the transport, leave the engine alone. */
  discard(): void {
    if (this.closed) return;
    this.teardown();
  }

  /** Tests / the dev strip: the confirm run the server paused on. */
  get pendingConfirmRunId(): string | null {
    return this.confirmRunId;
  }
}
