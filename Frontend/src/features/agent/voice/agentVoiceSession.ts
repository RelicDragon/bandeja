import type { AgentStreamEvent } from '@shared/agentContract';
import { isEventIdAtOrBefore } from '../agentRunReducer';
import { SpeechChunker } from './speechChunker';
import { VoiceStartError, type VoiceEngine, type VoiceStartErrorKind, type VoiceUtterance } from './voiceAudioEngine';

/**
 * One hands-free voice conversation in an agent chat (docs/domains/agent.md § Voice).
 *
 *   listening ─speech─▶ hearing ─end─▶ transcribing ─text─▶ (send, voice: true) ─▶ thinking
 *       ▲                                    │ nothing heard                         │ first sentence ready
 *       │◀───────────────────────────────────┘                                       ▼
 *       │◀────── reply spoken, run done ──────────────────────────────────────── speaking
 *       │◀────── Confirm / Cancel tapped (or the mic) ─── confirm ◀── run awaits a confirmation
 *
 * - The reply is spoken while it streams: `text.delta` → sentence chunks → `/voice/speech` (two
 *   in flight) → played in order.
 * - Barge-in: while thinking / speaking the microphone stays on with a stricter VAD; when the
 *   user talks, playback stops, the run is cancelled and their new turn is captured.
 * - A pending write is never confirmed by voice: the session stops listening until the card
 *   is tapped (or the user taps the mic to keep talking, which supersedes the card server-side).
 * - Leaving voice mode stops audio but never cancels a run: the reply still lands in the chat.
 */

export type AgentVoicePhase =
  | 'off'
  | 'starting'
  | 'listening'
  | 'hearing'
  | 'transcribing'
  | 'thinking'
  | 'speaking'
  | 'confirm';

export type AgentVoiceNotice =
  | 'micDenied'
  | 'micInsecure'
  | 'micUnsupported'
  | 'notHeard'
  | 'transcribeFailed'
  | 'sendFailed'
  | 'speechFailed'
  | 'runFailed'
  | 'interrupted'
  | 'unavailable'
  | 'budget'
  | 'rateLimited';

export type AgentVoiceCloseReason = 'user' | 'idle' | 'error' | 'interrupted';

export interface AgentVoiceState {
  phase: AgentVoicePhase;
  muted: boolean;
  notice: AgentVoiceNotice | null;
  /** What the user just said (as transcribed). */
  userCaption: string | null;
  /** The sentence being spoken. */
  agentCaption: string | null;
}

export interface AgentVoiceSessionDeps {
  /** A fresh engine per start (an engine is single-use). */
  createEngine: () => VoiceEngine;
  transcribe: (audio: Blob, durationMs: number, signal: AbortSignal) => Promise<string>;
  synthesize: (text: string, signal: AbortSignal) => Promise<ArrayBuffer>;
  /** Sends a voice turn; resolves with its run id. */
  send: (text: string) => Promise<string>;
  cancelRun: (runId: string) => Promise<void>;
  /** Events already received for a run (a run followed late catches up). */
  backlog: (runId: string) => readonly { eventId: string | null; event: AgentStreamEvent }[];
  onClose?: (reason: AgentVoiceCloseReason, notice: AgentVoiceNotice | null) => void;
  /**
   * Spoken when a run pauses on a confirmation card without having said anything (the model
   * went straight to the tool): `title` is the card's server-rendered title.
   */
  confirmPrompt?: (title: string | null) => string;
  /** API error → a specific notice; `fatal` ones end the session (no voice, no budget). */
  classifyError?: (error: unknown) => { notice: AgentVoiceNotice | null; fatal: boolean };
  /** Quiet listening this long ends the session (battery, cost). */
  idleTimeoutMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

interface FollowedRun {
  runId: string;
  chunker: SpeechChunker;
  lastEventId: string | null;
  /** Terminal event seen (or the user interrupted it). */
  done: boolean;
  /** Something of this run was queued for speech. */
  spoke: boolean;
  /** Title of the latest PENDING card of this run. */
  pendingTitle: string | null;
  outcome: 'completed' | 'confirm' | 'failed' | 'cancelled' | null;
}

const DEFAULT_IDLE_TIMEOUT_MS = 60_000;
const MAX_SYNTH_IN_FLIGHT = 2;
const START_ERROR_NOTICE: Record<VoiceStartErrorKind, AgentVoiceNotice> = {
  denied: 'micDenied',
  insecure: 'micInsecure',
  unsupported: 'micUnsupported',
};

const INITIAL: AgentVoiceState = { phase: 'off', muted: false, notice: null, userCaption: null, agentCaption: null };

export class AgentVoiceSession {
  private state: AgentVoiceState = INITIAL;
  private readonly listeners = new Set<() => void>();
  private run: FollowedRun | null = null;
  /** Runs this session already handled (a re-sent follow never restarts one). */
  private readonly seenRuns = new Set<string>();
  private speechGen = 0;
  private speechAbort = new AbortController();
  private playChain: Promise<void> = Promise.resolve();
  private pendingChunks = 0;
  private synthInFlight = 0;
  private readonly synthWaiters: (() => void)[] = [];
  private turnAbort: AbortController | null = null;
  private pendingCancel: Promise<void> = Promise.resolve();
  private idleTimer: unknown = null;
  private engine: VoiceEngine | null = null;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;

  constructor(private readonly deps: AgentVoiceSessionDeps) {
    this.setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = deps.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  }

  // --- store -----------------------------------------------------------------------------------

  getState = (): AgentVoiceState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** 0..1 microphone / playback loudness for the dock animation (polled, not part of the state). */
  levels(): { input: number; output: number } {
    return this.engine?.levels() ?? { input: 0, output: 0 };
  }

  get active(): boolean {
    return this.state.phase !== 'off';
  }

  /** The run being spoken (the view keeps attaching it). */
  get followedRunId(): string | null {
    return this.run && !this.run.done ? this.run.runId : null;
  }

  private set(patch: Partial<AgentVoiceState>): void {
    const next = { ...this.state, ...patch };
    if (
      next.phase === this.state.phase &&
      next.muted === this.state.muted &&
      next.notice === this.state.notice &&
      next.userCaption === this.state.userCaption &&
      next.agentCaption === this.state.agentCaption
    ) {
      return;
    }
    this.state = next;
    for (const listener of this.listeners) listener();
  }

  // --- lifecycle -------------------------------------------------------------------------------

  /** Call from the user's tap (iOS unlocks audio only inside a gesture). */
  async start(): Promise<void> {
    if (this.active) return;
    this.set({ ...INITIAL, phase: 'starting' });
    this.seenRuns.clear();
    const engine = this.deps.createEngine();
    this.engine = engine;
    try {
      await engine.start({
        onSpeechStart: () => this.onSpeechStart(),
        onSpeechDiscard: () => this.onSpeechDiscard(),
        onUtterance: (utterance) => void this.onUtterance(utterance),
        onInterrupted: () => this.stop('interrupted'),
      });
    } catch (error) {
      const notice = error instanceof VoiceStartError ? START_ERROR_NOTICE[error.kind] : 'micUnsupported';
      this.close('error', notice);
      return;
    }
    if (this.state.phase !== 'starting') return; // closed while the permission prompt was up
    this.toListening();
  }

  stop(reason: AgentVoiceCloseReason = 'user'): void {
    if (!this.active) return;
    this.close(reason, reason === 'interrupted' ? 'interrupted' : null);
  }

  private close(reason: AgentVoiceCloseReason, notice: AgentVoiceNotice | null): void {
    this.clearIdle();
    this.stopSpeech();
    this.turnAbort?.abort();
    this.turnAbort = null;
    this.run = null;
    this.engine?.stop();
    this.engine = null;
    this.state = { ...INITIAL, notice };
    for (const listener of this.listeners) listener();
    this.deps.onClose?.(reason, notice);
  }

  toggleMute(): void {
    if (!this.active) return;
    const muted = !this.state.muted;
    this.set({ muted });
    this.applyListening();
  }

  /**
   * The orb / mic button. Speaking or thinking: stop and listen (cancels an unfinished reply).
   * Confirm: listen again (a new turn supersedes the card). Muted: unmute.
   */
  tap(): void {
    const { phase } = this.state;
    if (this.state.muted) {
      this.toggleMute();
      return;
    }
    if (phase === 'speaking' || phase === 'thinking') {
      this.interruptReply();
      this.toListening();
    } else if (phase === 'confirm') {
      this.toListening();
    }
  }

  // --- chat → session --------------------------------------------------------------------------

  /** A run of this chat to speak (the reply to a voice turn, or a follow-up after Confirm). */
  followRun(runId: string): void {
    // The user is mid-turn: their own send will be followed instead.
    if (this.state.phase === 'hearing' || this.state.phase === 'transcribing') return;
    this.beginFollow(runId);
  }

  private beginFollow(runId: string): void {
    if (!this.active || this.seenRuns.has(runId)) return;
    this.seenRuns.add(runId);
    this.stopSpeech();
    this.run = { runId, chunker: new SpeechChunker(), lastEventId: null, done: false, outcome: null, spoke: false, pendingTitle: null };
    this.clearIdle();
    this.set({ phase: 'thinking', agentCaption: null, notice: null });
    this.applyListening();
    for (const { eventId, event } of this.deps.backlog(runId)) this.onRunEvent(runId, eventId, event);
  }

  onRunEvent(runId: string, eventId: string | null, event: AgentStreamEvent): void {
    const run = this.run;
    if (!run || run.runId !== runId || run.done) return;
    if (eventId != null && run.lastEventId != null && isEventIdAtOrBefore(eventId, run.lastEventId)) return;
    if (eventId != null) run.lastEventId = eventId;
    switch (event.type) {
      case 'text.delta':
        for (const chunk of run.chunker.push(event.text)) this.enqueueSpeech(chunk);
        break;
      case 'action.pending':
        if (event.action.status === 'PENDING') run.pendingTitle = event.action.preview.title;
        break;
      case 'run.completed':
        this.finishRun(run, event.status === 'AWAITING_CONFIRMATION' ? 'confirm' : 'completed');
        break;
      case 'run.failed':
        this.finishRun(run, 'failed');
        break;
      case 'run.cancelled':
        this.finishRun(run, 'cancelled');
        break;
      default:
        break;
    }
  }

  /**
   * The chat's pending-card state. In `confirm`, once no card is pending and nothing is
   * running (the user tapped Cancel, or Confirm without a follow-up), listen again.
   */
  syncChat(chat: { pendingAction: boolean; running: boolean }): void {
    if (this.state.phase === 'confirm' && !chat.pendingAction && !chat.running) this.toListening();
  }

  // --- engine → session ------------------------------------------------------------------------

  private onSpeechStart(): void {
    const { phase } = this.state;
    if (phase === 'listening') {
      this.clearIdle();
      this.set({ phase: 'hearing', notice: null });
    } else if (phase === 'thinking' || phase === 'speaking') {
      // Barge-in: the user talks over the reply.
      this.interruptReply();
      this.set({ phase: 'hearing', notice: null, agentCaption: null });
      this.engine?.setListening('normal');
    }
  }

  private onSpeechDiscard(): void {
    if (this.state.phase === 'hearing') this.toListening();
  }

  private async onUtterance(utterance: VoiceUtterance): Promise<void> {
    if (this.state.phase !== 'hearing') return;
    this.set({ phase: 'transcribing' });
    this.engine?.setListening('off');
    const abort = new AbortController();
    this.turnAbort = abort;
    let text: string;
    try {
      text = (await this.deps.transcribe(utterance.blob, utterance.durationMs, abort.signal)).trim();
    } catch (error) {
      if (abort.signal.aborted) return;
      this.failTurn(error, 'transcribeFailed');
      return;
    }
    if (abort.signal.aborted || this.getState().phase !== 'transcribing') return;
    if (!text) {
      this.toListening('notHeard');
      return;
    }
    this.set({ userCaption: text, agentCaption: null });
    let runId: string;
    try {
      await this.pendingCancel;
      if (abort.signal.aborted) return;
      runId = await this.deps.send(text);
    } catch (error) {
      if (abort.signal.aborted) return;
      this.failTurn(error, 'sendFailed');
      return;
    }
    if (abort.signal.aborted || this.getState().phase !== 'transcribing') return;
    this.turnAbort = null;
    this.beginFollow(runId);
  }

  private failTurn(error: unknown, fallback: AgentVoiceNotice): void {
    const classified = this.deps.classifyError?.(error);
    if (classified?.fatal) {
      this.close('error', classified.notice ?? fallback);
      return;
    }
    this.toListening(classified?.notice ?? fallback);
  }

  // --- speaking --------------------------------------------------------------------------------

  private enqueueSpeech(text: string): void {
    if (this.run) this.run.spoke = true;
    const gen = this.speechGen;
    const signal = this.speechAbort.signal;
    this.pendingChunks += 1;
    const audio = this.synthesize(text, signal);
    this.playChain = this.playChain
      .then(async () => {
        const bytes = await audio;
        if (gen !== this.speechGen) return;
        if (!bytes) {
          this.set({ notice: 'speechFailed' });
          return;
        }
        this.set({ phase: 'speaking', agentCaption: text });
        await this.engine?.play(bytes);
      })
      .catch(() => {})
      .then(() => {
        if (gen !== this.speechGen) return;
        this.pendingChunks -= 1;
        this.maybeEndTurn();
      });
  }

  private async synthesize(text: string, signal: AbortSignal): Promise<ArrayBuffer | null> {
    while (this.synthInFlight >= MAX_SYNTH_IN_FLIGHT) {
      await new Promise<void>((resolve) => this.synthWaiters.push(resolve));
      if (signal.aborted) return null;
    }
    this.synthInFlight += 1;
    try {
      return await this.deps.synthesize(text, signal);
    } catch {
      return null;
    } finally {
      this.synthInFlight -= 1;
      this.synthWaiters.shift()?.();
    }
  }

  private finishRun(run: FollowedRun, outcome: NonNullable<FollowedRun['outcome']>): void {
    for (const chunk of run.chunker.flush()) this.enqueueSpeech(chunk);
    if (outcome === 'confirm' && !run.spoke && this.deps.confirmPrompt) {
      this.enqueueSpeech(this.deps.confirmPrompt(run.pendingTitle));
    }
    run.done = true;
    run.outcome = outcome;
    this.maybeEndTurn();
  }

  /** Every chunk of a finished run is spoken: next step by the run's outcome. */
  private maybeEndTurn(): void {
    const run = this.run;
    if (!run || !run.done || this.pendingChunks > 0) return;
    if (this.state.phase !== 'thinking' && this.state.phase !== 'speaking') return;
    if (run.outcome === 'confirm') {
      this.set({ phase: 'confirm', agentCaption: null });
      this.applyListening();
      return;
    }
    this.toListening(run.outcome === 'failed' ? 'runFailed' : null);
  }

  /** Cut the reply: stop audio and, if the model is still going, cancel its run. */
  private interruptReply(): void {
    this.stopSpeech();
    const run = this.run;
    if (run && !run.done) {
      run.done = true;
      run.outcome = 'cancelled';
      this.pendingCancel = this.deps.cancelRun(run.runId).catch(() => {});
    }
  }

  private stopSpeech(): void {
    this.speechGen += 1;
    this.speechAbort.abort();
    this.speechAbort = new AbortController();
    this.playChain = Promise.resolve();
    this.pendingChunks = 0;
    for (const wake of this.synthWaiters.splice(0)) wake();
    this.engine?.stopPlayback();
  }

  // --- listening -------------------------------------------------------------------------------

  private toListening(notice: AgentVoiceNotice | null = null): void {
    if (!this.active) return;
    this.set({ phase: 'listening', notice, agentCaption: null });
    this.applyListening();
    this.armIdle();
  }

  private applyListening(): void {
    const { phase, muted } = this.state;
    if (muted || phase === 'confirm' || phase === 'transcribing' || phase === 'starting' || phase === 'off') {
      this.engine?.setListening('off');
    } else if (phase === 'thinking' || phase === 'speaking') {
      this.engine?.setListening('bargeIn');
    } else {
      this.engine?.setListening('normal');
    }
  }

  private armIdle(): void {
    this.clearIdle();
    this.idleTimer = this.setTimer(() => {
      this.idleTimer = null;
      if (this.state.phase === 'listening') this.stop('idle');
    }, this.deps.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS);
  }

  private clearIdle(): void {
    if (this.idleTimer != null) this.clearTimer(this.idleTimer);
    this.idleTimer = null;
  }
}
