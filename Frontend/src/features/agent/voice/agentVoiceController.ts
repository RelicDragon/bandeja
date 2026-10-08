import type { AgentStreamEvent } from '@shared/agentContract';
import type { AgentVoiceStartPayload, AgentVoiceTurnPayload } from '@shared/agentVoiceRealtime';
import {
  AgentVoiceSession,
  type AgentVoiceCloseReason,
  type AgentVoiceNotice,
  type AgentVoiceSessionDeps,
  type AgentVoiceState,
} from './agentVoiceSession';
import {
  AgentVoiceRealtimeSession,
  VOICE_ERROR_NOTICE,
  isFallbackAck,
  type AgentVoiceRealtimeSessionDeps,
} from './agentVoiceRealtimeSession';
import { isVoiceAuthRejectedAck, voiceV2Unavailable, type AgentVoiceTransport } from './agentVoiceRealtimeTransport';
import {
  INITIAL_VOICE_VIEW_STATE,
  type AgentVoicePlaybackPosition,
  type AgentVoiceViewState,
} from './agentVoiceViewState';
import {
  VoiceStartError,
  adoptStartedVoiceEngine,
  type RealtimeVoiceEngine,
  type VoiceEngineHandlers,
  type VoiceStartErrorKind,
} from './voiceAudioEngine';

/**
 * The voice conversation the chat view talks to: realtime (v2) when the server offers it,
 * otherwise — and for good once v2 drops out mid-conversation — the HTTP loop (v1,
 * `AgentVoiceSession`). Both run on one engine started inside the user's tap, so a fallback
 * never needs a second gesture on iOS.
 *
 *   start ─┬─ engine.start (mic, AudioContext in the tap) ─┐
 *          └─ voice:start (≤ 3 s) ────────────────────────┴─▶ ok: v2 · unavailable / timeout: v1
 */

export interface AgentVoiceControllerDeps {
  /** The v1 loop, minus what the controller owns. */
  v1: Omit<AgentVoiceSessionDeps, 'createEngine' | 'onClose'>;
  createEngine: () => RealtimeVoiceEngine;
  /** null: realtime is off for this start (no token, kill switch) → v1 at once. */
  createTransport: () => AgentVoiceTransport | null;
  startPayload: (muted: boolean) => AgentVoiceStartPayload;
  onClose: (reason: AgentVoiceCloseReason, notice: AgentVoiceNotice | null) => void;
  onTurn?: (turn: AgentVoiceTurnPayload) => void;
  onReplyCut?: () => void;
  /**
   * The voice socket refused the token: refresh it the way the app's REST client / main socket do.
   * Resolves true when a new token is in place (→ one retry of `voice:start`), false → v1.
   */
  refreshAuth?: () => Promise<boolean>;
  startTimeoutMs?: number;
  /** Test hooks for the realtime session (timers, clock, idle). */
  realtime?: Pick<AgentVoiceRealtimeSessionDeps, 'now' | 'setTimer' | 'clearTimer' | 'idleTimeoutMs' | 'restartTimeoutMs'>;
}

const DEFAULT_START_TIMEOUT_MS = 3_000;
const START_ERROR_NOTICE: Record<VoiceStartErrorKind, AgentVoiceNotice> = {
  denied: 'micDenied',
  insecure: 'micInsecure',
  unsupported: 'micUnsupported',
};
const NOOP_HANDLERS: VoiceEngineHandlers = {
  onSpeechStart: () => {},
  onSpeechDiscard: () => {},
  onUtterance: () => {},
  onInterrupted: () => {},
};

export class AgentVoiceController {
  private own: AgentVoiceViewState = INITIAL_VOICE_VIEW_STATE;
  private v1: AgentVoiceSession | null = null;
  private v2: AgentVoiceRealtimeSession | null = null;
  private engine: RealtimeVoiceEngine | null = null;
  private unsubscribeInner: (() => void) | null = null;
  private v1View: { source: AgentVoiceState; view: AgentVoiceViewState } | null = null;
  private startGen = 0;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly deps: AgentVoiceControllerDeps) {}

  // --- store -----------------------------------------------------------------------------------

  getState = (): AgentVoiceViewState => {
    if (this.v2) return this.v2.getState();
    if (this.v1) {
      const source = this.v1.getState();
      if (this.v1View?.source !== source) {
        this.v1View = { source, view: { ...INITIAL_VOICE_VIEW_STATE, ...source, transport: source.phase === 'off' ? null : 'v1' } };
      }
      return this.v1View.view;
    }
    return this.own;
  };

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private notify = (): void => {
    for (const listener of this.listeners) listener();
  };

  get active(): boolean {
    return this.getState().phase !== 'off';
  }

  /** Which loop runs (null while starting / off). */
  get transport(): 'v1' | 'v2' | null {
    return this.v2 ? 'v2' : this.v1 ? 'v1' : null;
  }

  levels(): { input: number; output: number } {
    if (this.v2) return this.v2.levels();
    if (this.v1) return this.v1.levels();
    return { input: 0, output: 0 };
  }

  playbackPosition(): AgentVoicePlaybackPosition | null {
    return this.v2?.playbackPosition() ?? null;
  }

  // --- lifecycle -------------------------------------------------------------------------------

  /** Call from the user's tap: the engine creates its AudioContext before the first await. */
  async start(): Promise<void> {
    if (this.active) return;
    const gen = ++this.startGen;
    this.setOwn({ ...INITIAL_VOICE_VIEW_STATE, phase: 'starting' });
    const engine = this.deps.createEngine();
    this.engine = engine;
    const engineStart = engine.start(NOOP_HANDLERS);
    const transport = this.deps.createTransport();
    const session = transport ? this.createRealtime(transport, engine) : null;
    const ackPromise = transport ? this.startTransport(transport, gen) : Promise.resolve(voiceV2Unavailable('off'));

    try {
      await engineStart;
    } catch (error) {
      session?.discard();
      if (gen !== this.startGen) return;
      engine.stop();
      this.engine = null;
      this.closeOwn('error', error instanceof VoiceStartError ? START_ERROR_NOTICE[error.kind] : 'micUnsupported');
      return;
    }
    const ack = await ackPromise;
    if (gen !== this.startGen) {
      // Ended while the mic prompt / the socket was pending.
      session?.discard();
      return;
    }
    if (ack.ok && session) {
      this.v2 = session;
      this.unsubscribeInner = session.subscribe(this.notify);
      session.activate(ack.outputSampleRate, ack.sessionId);
      this.notify();
      return;
    }
    session?.discard();
    if (!ack.ok && !isFallbackAck(ack)) {
      engine.stop();
      this.engine = null;
      this.closeOwn('error', VOICE_ERROR_NOTICE[ack.code] ?? 'runFailed');
      return;
    }
    await this.startV1(engine);
  }

  stop(reason: AgentVoiceCloseReason = 'user'): void {
    if (this.v2) this.v2.stop(reason);
    else if (this.v1) this.v1.stop(reason);
    else if (this.own.phase !== 'off') {
      this.startGen += 1;
      this.engine?.stop();
      this.engine = null;
      this.closeOwn(reason, reason === 'interrupted' ? 'interrupted' : null);
    }
  }

  toggleMute(): void {
    if (this.v2) this.v2.toggleMute();
    else this.v1?.toggleMute();
  }

  tap(): void {
    if (this.v2) this.v2.tap();
    else this.v1?.tap();
  }

  // --- chat → session --------------------------------------------------------------------------

  followRun(runId: string): void {
    if (this.v2) this.v2.followRun(runId);
    else this.v1?.followRun(runId);
  }

  /** v1 speaks the run from its SSE events; v2 gets the audio from the server. */
  onRunEvent(runId: string, eventId: string | null, event: AgentStreamEvent): void {
    this.v1?.onRunEvent(runId, eventId, event);
  }

  syncChat(chat: { pendingAction: boolean; running: boolean }): void {
    if (this.v2) this.v2.syncChat(chat);
    else this.v1?.syncChat(chat);
  }

  // --- internals -------------------------------------------------------------------------------

  /** `voice:start`; an expired / invalid token gets one refresh and one retry (else v1). */
  private async startTransport(transport: AgentVoiceTransport, gen: number) {
    const timeoutMs = this.deps.startTimeoutMs ?? DEFAULT_START_TIMEOUT_MS;
    const payload = this.deps.startPayload(false);
    const ack = await transport.start(payload, timeoutMs);
    const { refreshAuth } = this.deps;
    if (!isVoiceAuthRejectedAck(ack) || !refreshAuth) return ack;
    const refreshed = await refreshAuth().catch(() => false);
    if (!refreshed || gen !== this.startGen) return ack;
    return transport.start(payload, timeoutMs);
  }

  private createRealtime(transport: AgentVoiceTransport, engine: RealtimeVoiceEngine): AgentVoiceRealtimeSession {
    const session: AgentVoiceRealtimeSession = new AgentVoiceRealtimeSession({
      ...this.deps.realtime,
      transport,
      engine,
      startPayload: this.deps.startPayload,
      onTurn: (turn) => this.deps.onTurn?.(turn),
      onReplyCut: () => this.deps.onReplyCut?.(),
      onClose: (reason, notice) => this.onInnerClose(reason, notice),
      onFallback: () => {
        if (this.v2 !== session) return;
        this.detachInner();
        void this.startV1(engine);
      },
    });
    return session;
  }

  private async startV1(engine: RealtimeVoiceEngine): Promise<void> {
    const v1 = new AgentVoiceSession({
      ...this.deps.v1,
      createEngine: () => adoptStartedVoiceEngine(engine),
      onClose: (reason, notice) => this.onInnerClose(reason, notice),
    });
    this.v1 = v1;
    this.v1View = null;
    this.unsubscribeInner = v1.subscribe(this.notify);
    this.notify();
    await v1.start();
  }

  private detachInner(): void {
    this.unsubscribeInner?.();
    this.unsubscribeInner = null;
    this.v1 = null;
    this.v2 = null;
    this.v1View = null;
  }

  private onInnerClose(reason: AgentVoiceCloseReason, notice: AgentVoiceNotice | null): void {
    this.detachInner();
    this.engine = null;
    this.closeOwn(reason, notice);
  }

  private closeOwn(reason: AgentVoiceCloseReason, notice: AgentVoiceNotice | null): void {
    this.setOwn({ ...INITIAL_VOICE_VIEW_STATE, notice });
    this.deps.onClose(reason, notice);
  }

  private setOwn(state: AgentVoiceViewState): void {
    this.own = state;
    this.notify();
  }
}
