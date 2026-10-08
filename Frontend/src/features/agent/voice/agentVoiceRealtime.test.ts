import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AgentVoiceClientToServerEvents,
  AgentVoiceServerToClientEvents,
  AgentVoiceStartAck,
  AgentVoiceStartPayload,
} from '@shared/agentVoiceRealtime';
import { AgentVoiceController, type AgentVoiceControllerDeps } from './agentVoiceController';
import { voiceAuthRejected, type AgentVoiceConnection, type AgentVoiceTransport } from './agentVoiceRealtimeTransport';
import type { ScheduledPcm } from './pcmStreamPlayer';
import type { RealtimeVoiceEngine, VoiceEngineHandlers, VoiceFrameSink, VoiceListenMode } from './voiceAudioEngine';

type ServerEvent = keyof AgentVoiceServerToClientEvents;

class FakeTransport implements AgentVoiceTransport {
  handlers = new Map<string, (payload: unknown) => void>();
  emitted: { event: string; payload: unknown }[] = [];
  audio: ArrayBuffer[] = [];
  starts: AgentVoiceStartPayload[] = [];
  ack: AgentVoiceStartAck = { ok: true, sessionId: 's-1', outputSampleRate: 24_000, maxSessionMs: 600_000 };
  closed = false;
  private connection: ((c: AgentVoiceConnection) => void) | null = null;

  /** Acks for the next starts, in order (then `ack`). */
  acks: AgentVoiceStartAck[] = [];

  async start(payload: AgentVoiceStartPayload) {
    this.starts.push(payload);
    return this.acks.shift() ?? this.ack;
  }
  on<E extends ServerEvent>(event: E, handler: AgentVoiceServerToClientEvents[E]) {
    this.handlers.set(event, handler as (payload: unknown) => void);
  }
  emit<E extends keyof AgentVoiceClientToServerEvents>(event: E, ...args: unknown[]) {
    this.emitted.push({ event, payload: args[0] });
  }
  sendAudio(chunk: ArrayBuffer) {
    this.audio.push(chunk);
  }
  onConnection(handler: (c: AgentVoiceConnection) => void) {
    this.connection = handler;
  }
  close() {
    this.closed = true;
  }
  server<E extends ServerEvent>(event: E, payload: Parameters<AgentVoiceServerToClientEvents[E]>[0]) {
    this.handlers.get(event)?.(payload);
  }
  setConnection(c: AgentVoiceConnection) {
    this.connection?.(c);
  }
  sent(event: string) {
    return this.emitted.filter((e) => e.event === event).map((e) => e.payload);
  }
}

interface Scheduled {
  samples: number;
  at: number;
  stopped: boolean;
}

class FakeEngine implements RealtimeVoiceEngine {
  handlers: VoiceEngineHandlers | null = null;
  sink: VoiceFrameSink | null = null;
  modes: VoiceListenMode[] = [];
  scheduled: Scheduled[] = [];
  played: string[] = [];
  stopped = false;
  startCalls = 0;
  time = 0;
  startError: Error | null = null;

  async start(handlers: VoiceEngineHandlers) {
    this.startCalls += 1;
    if (this.startError) throw this.startError;
    this.handlers = handlers;
  }
  setHandlers(handlers: VoiceEngineHandlers) {
    this.handlers = handlers;
  }
  setFrameSink(sink: VoiceFrameSink | null) {
    this.sink = sink;
  }
  setListening(mode: VoiceListenMode) {
    this.modes.push(mode);
  }
  get mode() {
    return this.modes[this.modes.length - 1] ?? 'off';
  }
  async play(audio: ArrayBuffer) {
    this.played.push(new TextDecoder().decode(audio));
  }
  stopPlayback() {}
  levels() {
    return { input: 0.1, output: 0.2 };
  }
  stop() {
    this.stopped = true;
  }
  currentTime() {
    return this.time;
  }
  schedulePcm(samples: Float32Array, _rate: number, at: number): ScheduledPcm {
    const entry = { samples: samples.length, at, stopped: false };
    this.scheduled.push(entry);
    return { stop: () => (entry.stopped = true) };
  }
  /** 20 ms frames at 48 kHz with the given level. */
  frames(db: number, count: number) {
    const amp = Math.pow(10, db / 20) * Math.SQRT2;
    for (let n = 0; n < count; n++) {
      const frame = new Float32Array(960);
      for (let i = 0; i < frame.length; i++) frame[i] = amp * Math.sin((2 * Math.PI * 300 * i) / 48_000);
      this.sink?.(frame, 48_000, db);
    }
  }
}

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

/** PCM16 of `ms` at 24 kHz. */
const pcm = (ms: number) => new Int16Array((24_000 * ms) / 1000).fill(1000).buffer;

function setup(overrides: Partial<AgentVoiceControllerDeps> = {}) {
  const engine = new FakeEngine();
  const transport = new FakeTransport();
  const timers: { fn: () => void; ms: number; live: boolean }[] = [];
  let clock = 1_000_000;
  const deps = {
    createEngine: () => engine,
    createTransport: () => transport,
    startPayload: (muted: boolean) => ({ chatId: 'chat-1', locale: 'en', inputSampleRate: 24_000 as const, ...(muted ? { muted } : {}) }),
    onClose: vi.fn(),
    onTurn: vi.fn(),
    onReplyCut: vi.fn(),
    v1: {
      transcribe: vi.fn(async () => 'Any games tomorrow?'),
      synthesize: vi.fn(async (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer),
      send: vi.fn(async () => 'run-v1'),
      cancelRun: vi.fn(async () => {}),
      backlog: vi.fn(() => []),
    },
    realtime: {
      now: () => clock,
      setTimer: (fn: () => void, ms: number) => {
        timers.push({ fn, ms, live: true });
        return timers.length - 1;
      },
      clearTimer: (handle: unknown) => {
        const t = timers[handle as number];
        if (t) t.live = false;
      },
    },
    ...overrides,
  } satisfies AgentVoiceControllerDeps;
  const voice = new AgentVoiceController(deps);
  /** Runs the live timers of this duration once (the 250 ms playback report, the idle end). */
  const runTimers = (ms: number) => {
    for (const t of timers.filter((x) => x.live && x.ms === ms)) {
      t.live = false;
      t.fn();
    }
  };
  const tick = (ms: number) => {
    clock += ms;
  };
  return { engine, transport, deps, voice, runTimers, tick };
}

async function startV2(ctx: ReturnType<typeof setup>) {
  await ctx.voice.start();
  await flush();
  // Learn the room (400 ms calibration of the upload gate's VAD).
  ctx.engine.frames(-70, 25);
}

describe('AgentVoiceController — v2 start and v1 fallback', () => {
  beforeEach(() => vi.clearAllMocks());

  it('starts realtime when the server acks: payload, listening, streaming capture on', async () => {
    const ctx = setup();
    await ctx.voice.start();
    expect(ctx.transport.starts).toEqual([{ chatId: 'chat-1', locale: 'en', inputSampleRate: 24_000 }]);
    expect(ctx.voice.getState()).toMatchObject({ phase: 'listening', transport: 'v2' });
    expect(ctx.engine.sink).not.toBeNull();
    expect(ctx.engine.mode).toBe('normal');
  });

  it('refreshes the token once and retries when the handshake is refused for auth', async () => {
    const refreshAuth = vi.fn(async () => true);
    const ctx = setup({ refreshAuth });
    ctx.transport.acks = [voiceAuthRejected('Authentication error: Invalid token')];
    await ctx.voice.start();
    expect(refreshAuth).toHaveBeenCalledTimes(1);
    expect(ctx.transport.starts).toHaveLength(2);
    expect(ctx.transport.closed).toBe(false);
    expect(ctx.voice.getState()).toMatchObject({ phase: 'listening', transport: 'v2' });
  });

  it('falls back to v1 when the refresh yields no new token, or the retry is refused again', async () => {
    const noToken = setup({ refreshAuth: vi.fn(async () => false) });
    noToken.transport.acks = [voiceAuthRejected('Authentication error: Invalid token')];
    await noToken.voice.start();
    await flush();
    expect(noToken.transport.starts).toHaveLength(1);
    expect(noToken.voice.getState()).toMatchObject({ transport: 'v1' });

    const refusedAgain = setup({ refreshAuth: vi.fn(async () => true) });
    const rejected = voiceAuthRejected('Authentication error: Invalid token');
    refusedAgain.transport.acks = [rejected, rejected, rejected];
    await refusedAgain.voice.start();
    await flush();
    expect(refusedAgain.deps.refreshAuth).toHaveBeenCalledTimes(1);
    expect(refusedAgain.transport.starts).toHaveLength(2);
    expect(refusedAgain.voice.getState()).toMatchObject({ transport: 'v1' });
  });

  it('does not refresh the token for other start failures', async () => {
    const refreshAuth = vi.fn(async () => true);
    const ctx = setup({ refreshAuth });
    ctx.transport.ack = { ok: false, code: 'VOICE_V2_UNAVAILABLE', message: 'timeout' };
    await ctx.voice.start();
    await flush();
    expect(refreshAuth).not.toHaveBeenCalled();
    expect(ctx.voice.getState()).toMatchObject({ transport: 'v1' });
  });

  it('falls back to v1 on VOICE_V2_UNAVAILABLE, on the same engine (no second gesture)', async () => {
    const ctx = setup();
    ctx.transport.ack = { ok: false, code: 'VOICE_V2_UNAVAILABLE' };
    await ctx.voice.start();
    await flush();
    expect(ctx.transport.closed).toBe(true);
    expect(ctx.engine.startCalls).toBe(1);
    expect(ctx.engine.sink).toBeNull();
    expect(ctx.voice.getState()).toMatchObject({ phase: 'listening', transport: 'v1' });

    // The v1 loop runs on the adopted engine.
    ctx.engine.handlers?.onSpeechStart();
    ctx.engine.handlers?.onUtterance({ blob: new Blob(['a']), durationMs: 900 });
    await flush();
    expect(ctx.deps.v1.send).toHaveBeenCalledWith('Any games tomorrow?');
    expect(ctx.voice.getState().phase).toBe('thinking');
  });

  it('goes straight to v1 when realtime is off', async () => {
    const ctx = setup({ createTransport: () => null });
    await ctx.voice.start();
    await flush();
    expect(ctx.voice.getState()).toMatchObject({ phase: 'listening', transport: 'v1' });
  });

  it('a refused start that v1 cannot fix either ends with its notice', async () => {
    const ctx = setup();
    ctx.transport.ack = { ok: false, code: 'BUDGET_EXCEEDED' };
    await ctx.voice.start();
    expect(ctx.deps.onClose).toHaveBeenCalledWith('error', 'budget');
    expect(ctx.engine.stopped).toBe(true);
    expect(ctx.voice.getState()).toMatchObject({ phase: 'off', notice: 'budget' });
  });

  it('a denied microphone ends with micDenied and closes the socket', async () => {
    const ctx = setup();
    const { VoiceStartError } = await import('./voiceAudioEngine');
    ctx.engine.startError = new VoiceStartError('denied');
    await ctx.voice.start();
    expect(ctx.deps.onClose).toHaveBeenCalledWith('error', 'micDenied');
    expect(ctx.transport.closed).toBe(true);
  });

  it('a lost connection mid-conversation continues on v1', async () => {
    const ctx = setup();
    await startV2(ctx);
    ctx.transport.setConnection('reconnecting');
    expect(ctx.voice.getState().reconnecting).toBe(true);
    ctx.transport.setConnection('lost');
    await flush();
    expect(ctx.voice.getState()).toMatchObject({ transport: 'v1', phase: 'listening' });
    expect(ctx.engine.stopped).toBe(false);
    expect(ctx.deps.onClose).not.toHaveBeenCalled();
  });

  it('a reconnect restarts the server session on the same socket', async () => {
    const ctx = setup();
    await startV2(ctx);
    ctx.voice.toggleMute();
    ctx.transport.setConnection('reconnecting');
    ctx.transport.setConnection('connected');
    await flush();
    expect(ctx.transport.starts[1]).toMatchObject({ chatId: 'chat-1', muted: true, resumeSessionId: 's-1' });
    expect(ctx.voice.getState()).toMatchObject({ reconnecting: false, transport: 'v2' });
    // A fresh session (grace over): the next reconnect resumes that one.
    ctx.transport.ack = { ok: true, sessionId: 's-2', outputSampleRate: 24_000, maxSessionMs: 600_000 };
    ctx.transport.setConnection('reconnecting');
    ctx.transport.setConnection('connected');
    await flush();
    ctx.transport.setConnection('reconnecting');
    ctx.transport.setConnection('connected');
    await flush();
    expect(ctx.transport.starts[3]).toMatchObject({ resumeSessionId: 's-2' });
  });

  it('a resumed session keeps the turn: the playing reply is reported played out, the server re-sends its phase', async () => {
    const ctx = setup();
    await startV2(ctx);
    ctx.transport.server('voice:state', { phase: 'speaking', turnId: 't1', runId: 'r1' });
    ctx.transport.server('voice:audio-out', { turnId: 't1', seq: 0, pcm: pcm(300) });
    expect(ctx.voice.getState().phase).toBe('speaking');
    ctx.transport.acks.push({ ok: true, sessionId: 's-1', outputSampleRate: 24_000, maxSessionMs: 600_000, resumed: true });
    ctx.transport.setConnection('reconnecting');
    ctx.transport.setConnection('connected');
    await flush();
    expect(ctx.transport.starts[1]).toMatchObject({ resumeSessionId: 's-1' });
    expect(ctx.transport.sent('voice:playback').at(-1)).toMatchObject({ turnId: 't1', done: true });
    expect(ctx.voice.getState()).toMatchObject({ reconnecting: false, transport: 'v2', phase: 'speaking' });
    ctx.transport.server('voice:state', { phase: 'listening' });
    expect(ctx.voice.getState().phase).toBe('listening');
  });
});

describe('AgentVoiceRealtimeSession', () => {
  beforeEach(() => vi.clearAllMocks());

  it('streams speech (with pre-roll) and stops sending silence after the hangover', async () => {
    const ctx = setup();
    await startV2(ctx);
    expect(ctx.transport.audio).toHaveLength(0);
    ctx.engine.frames(-20, 10);
    const bytes = ctx.transport.audio.reduce((n, b) => n + b.byteLength, 0);
    // 20 frames of pre-roll + the voiced frames, 480 samples × 2 bytes each, in batches of 3.
    expect(bytes).toBeGreaterThanOrEqual(27 * 960);
    expect(ctx.transport.audio[0].byteLength).toBe(3 * 960);
    ctx.engine.frames(-70, 100); // 2 s of silence
    const after = ctx.transport.audio.length;
    ctx.engine.frames(-70, 50);
    expect(ctx.transport.audio.length).toBe(after);
  });

  it('always streams while hearing / thinking (the server detects the end and barge-in)', async () => {
    const ctx = setup();
    await startV2(ctx);
    ctx.transport.server('voice:state', { phase: 'thinking', turnId: 't1' });
    const before = ctx.transport.audio.length;
    ctx.engine.frames(-70, 30);
    // The pre-roll ring (20 frames) goes first, then every frame, 3 per emit.
    expect(ctx.transport.audio.length).toBe(before + Math.floor((20 + 30) / 3));
  });

  it('shows partial and final captions, then the turn (run id, onTurn)', async () => {
    const ctx = setup();
    await startV2(ctx);
    ctx.transport.server('voice:state', { phase: 'hearing', turnId: 't1' });
    ctx.transport.server('voice:caption', { turnId: 't1', text: 'any games', final: false });
    expect(ctx.voice.getState().liveCaption).toEqual({ turnId: 't1', text: 'any games', final: false, runId: null });
    ctx.transport.server('voice:caption', { turnId: 't1', text: 'Any games tomorrow?', final: true });
    expect(ctx.voice.getState()).toMatchObject({ userCaption: 'Any games tomorrow?', liveCaption: { final: true } });
    ctx.transport.server('voice:turn', { turnId: 't1', runId: 'run-1', transcript: 'Any games tomorrow?' });
    expect(ctx.voice.getState().liveCaption).toEqual({ turnId: 't1', text: 'Any games tomorrow?', final: true, runId: 'run-1' });
    expect(ctx.deps.onTurn).toHaveBeenCalledWith({ turnId: 't1', runId: 'run-1', transcript: 'Any games tomorrow?' });
  });

  it('drops a partial caption that never became a turn', async () => {
    const ctx = setup();
    await startV2(ctx);
    ctx.transport.server('voice:caption', { turnId: 't1', text: 'hm', final: false });
    ctx.transport.server('voice:state', { phase: 'listening' });
    expect(ctx.voice.getState().liveCaption).toBeNull();
  });

  it('plays reply audio gaplessly in seq order and drops chunks of stale turns', async () => {
    const ctx = setup();
    await startV2(ctx);
    ctx.transport.server('voice:audio-out', { turnId: 't1', seq: 1, pcm: pcm(100) });
    expect(ctx.engine.scheduled).toHaveLength(0); // waits for seq 0
    ctx.transport.server('voice:audio-out', { turnId: 't1', seq: 0, pcm: pcm(200) });
    expect(ctx.engine.scheduled.map((s) => s.samples)).toEqual([4800, 2400]);
    const [a, b] = ctx.engine.scheduled;
    expect(b.at).toBeCloseTo(a.at + 0.2, 6);
    expect(ctx.voice.getState().phase).toBe('speaking');

    // A newer turn retires t1: its playing chunks stop, its late chunks are dropped.
    ctx.transport.server('voice:audio-out', { turnId: 't2', seq: 0, pcm: pcm(100) });
    expect(a.stopped && b.stopped).toBe(true);
    ctx.transport.server('voice:audio-out', { turnId: 't1', seq: 2, pcm: pcm(100) });
    expect(ctx.engine.scheduled).toHaveLength(3);
  });

  it('reports playback every 250 ms and once more when done, then follows the server phase', async () => {
    const ctx = setup();
    await startV2(ctx);
    ctx.transport.server('voice:state', { phase: 'speaking', turnId: 't1' });
    ctx.transport.server('voice:audio-out', { turnId: 't1', seq: 0, pcm: pcm(400) });
    ctx.transport.server('voice:audio-end', { turnId: 't1' });
    ctx.transport.server('voice:state', { phase: 'listening', turnId: 't1' });
    expect(ctx.voice.getState().phase).toBe('speaking'); // the tail still plays
    ctx.engine.time = 0.26;
    ctx.runTimers(250);
    expect(ctx.transport.sent('voice:playback')).toEqual([{ turnId: 't1', playedMs: 200, done: false }]);
    ctx.engine.time = 1;
    ctx.runTimers(250);
    expect(ctx.transport.sent('voice:playback')[1]).toEqual({ turnId: 't1', playedMs: 400, done: true });
    expect(ctx.voice.getState().phase).toBe('listening');
  });

  it('highlights the sentence being spoken (karaoke) and clears the progress chip', async () => {
    const ctx = setup();
    await startV2(ctx);
    ctx.transport.server('voice:turn', { turnId: 't1', runId: 'run-1', transcript: 'Games?' });
    ctx.transport.server('voice:speech-text', { turnId: 't1', seq: 0, kind: 'progress', text: 'Checking your games…' });
    expect(ctx.voice.getState().progress).toBe('Checking your games…');
    ctx.transport.server('voice:speech-text', { turnId: 't1', seq: 1, kind: 'reply', text: 'Two games tomorrow.' });
    ctx.transport.server('voice:audio-out', { turnId: 't1', seq: 0, pcm: pcm(300) });
    ctx.transport.server('voice:speech-text', { turnId: 't1', seq: 2, kind: 'reply', text: 'The best is at seven.' });
    ctx.transport.server('voice:audio-out', { turnId: 't1', seq: 1, pcm: pcm(300) });
    expect(ctx.voice.getState().reply?.lines.map((l) => l.startMs)).toEqual([0, 300]);
    ctx.engine.time = 0.1;
    ctx.runTimers(250);
    expect(ctx.voice.getState()).toMatchObject({ agentCaption: 'Two games tomorrow.', progress: null, reply: { activeSeq: 1 } });
    ctx.engine.time = 0.45;
    ctx.runTimers(250);
    expect(ctx.voice.getState()).toMatchObject({ agentCaption: 'The best is at seven.', reply: { activeSeq: 2 } });
  });

  it('voice:stop-playback flushes at once and reports what was heard', async () => {
    const ctx = setup();
    await startV2(ctx);
    ctx.transport.server('voice:audio-out', { turnId: 't1', seq: 0, pcm: pcm(500) });
    ctx.engine.time = 0.16;
    ctx.transport.server('voice:stop-playback', { turnId: 't1' });
    expect(ctx.engine.scheduled[0].stopped).toBe(true);
    expect(ctx.transport.sent('voice:playback')).toEqual([{ turnId: 't1', playedMs: 100, done: false }]);
    ctx.transport.server('voice:audio-out', { turnId: 't1', seq: 1, pcm: pcm(100) });
    expect(ctx.engine.scheduled).toHaveLength(1);
    expect(ctx.deps.onReplyCut).toHaveBeenCalledTimes(1);
  });

  it('local barge-in while speaking: flush + voice:interrupt {turnId, playedMs}, then hearing', async () => {
    const ctx = setup();
    await startV2(ctx);
    ctx.transport.server('voice:state', { phase: 'speaking', turnId: 't1' });
    ctx.transport.server('voice:audio-out', { turnId: 't1', seq: 0, pcm: pcm(1000) });
    expect(ctx.engine.mode).toBe('bargeIn');
    ctx.engine.time = 0.36;
    ctx.engine.handlers?.onSpeechStart();
    expect(ctx.engine.scheduled[0].stopped).toBe(true);
    expect(ctx.transport.sent('voice:interrupt')).toEqual([{ turnId: 't1', playedMs: 300 }]);
    expect(ctx.voice.getState().phase).toBe('hearing');
    expect(ctx.engine.mode).toBe('normal');
    // The server truncates the stored reply: the chat refetches.
    expect(ctx.deps.onReplyCut).toHaveBeenCalledTimes(1);
  });

  it('the orb interrupts while thinking / speaking and goes back to listening', async () => {
    const ctx = setup();
    await startV2(ctx);
    ctx.transport.server('voice:state', { phase: 'thinking', turnId: 't1', runId: 'run-1' });
    ctx.voice.tap();
    expect(ctx.transport.sent('voice:interrupt')).toEqual([{ turnId: 't1' }]);
    expect(ctx.voice.getState().phase).toBe('listening');
  });

  it('confirm: mic off; Confirm with a follow-up run → voice:follow-run', async () => {
    const ctx = setup();
    await startV2(ctx);
    ctx.transport.server('voice:state', { phase: 'confirm', turnId: 't1', runId: 'run-1', confirmTitle: 'Book court 3' });
    expect(ctx.voice.getState()).toMatchObject({ phase: 'confirm', confirmTitle: 'Book court 3' });
    expect(ctx.engine.mode).toBe('off');
    const before = ctx.transport.audio.length;
    ctx.engine.frames(-20, 30);
    expect(ctx.transport.audio.length).toBe(before);

    ctx.voice.followRun('run-1'); // the run it paused on: not a follow-up
    expect(ctx.transport.sent('voice:follow-run')).toEqual([]);
    ctx.voice.followRun('run-2');
    ctx.voice.syncChat({ pendingAction: false, running: true });
    expect(ctx.transport.sent('voice:follow-run')).toEqual([{ runId: 'run-2' }]);
    expect(ctx.transport.sent('voice:resume')).toEqual([]);
    expect(ctx.voice.getState().phase).toBe('thinking');
  });

  it('confirm: Reject (no card, nothing running) or the orb → voice:resume', async () => {
    const ctx = setup();
    await startV2(ctx);
    ctx.transport.server('voice:state', { phase: 'confirm', turnId: 't1', runId: 'run-1' });
    ctx.voice.syncChat({ pendingAction: true, running: false });
    expect(ctx.transport.sent('voice:resume')).toEqual([]);
    ctx.voice.syncChat({ pendingAction: false, running: false });
    expect(ctx.transport.sent('voice:resume')).toEqual([{}]);
    expect(ctx.voice.getState().phase).toBe('listening');

    ctx.transport.server('voice:state', { phase: 'confirm', turnId: 't2', runId: 'run-2' });
    ctx.voice.tap();
    expect(ctx.transport.sent('voice:resume')).toHaveLength(2);
  });

  it('mute: voice:mute, nothing sent, the orb unmutes', async () => {
    const ctx = setup();
    await startV2(ctx);
    ctx.voice.toggleMute();
    expect(ctx.transport.sent('voice:mute')).toEqual([{ muted: true }]);
    expect(ctx.engine.mode).toBe('off');
    ctx.engine.frames(-20, 30);
    expect(ctx.transport.audio).toHaveLength(0);
    ctx.voice.tap();
    expect(ctx.transport.sent('voice:mute')).toEqual([{ muted: true }, { muted: false }]);
    expect(ctx.voice.getState().muted).toBe(false);
  });

  it('a fatal error ends the conversation; a non-fatal one only shows a notice', async () => {
    const ctx = setup();
    await startV2(ctx);
    ctx.transport.server('voice:error', { code: 'RATE_LIMITED', fatal: false });
    expect(ctx.voice.getState()).toMatchObject({ phase: 'listening', notice: 'rateLimited' });
    // A failed TTS call: the reply is still in the chat.
    ctx.transport.server('voice:error', { code: 'VOICE_UNAVAILABLE', fatal: false });
    expect(ctx.voice.getState().notice).toBe('speechFailed');
    ctx.transport.server('voice:error', { code: 'BUDGET_EXCEEDED', fatal: true });
    expect(ctx.deps.onClose).toHaveBeenCalledWith('error', 'budget');
    expect(ctx.engine.stopped).toBe(true);
    expect(ctx.transport.closed).toBe(true);
    expect(ctx.voice.active).toBe(false);
  });

  it('a fatal VOICE_V2_UNAVAILABLE switches to v1 instead of ending', async () => {
    const ctx = setup();
    await startV2(ctx);
    ctx.transport.server('voice:error', { code: 'VOICE_V2_UNAVAILABLE', fatal: true });
    await flush();
    expect(ctx.voice.getState().transport).toBe('v1');
    expect(ctx.deps.onClose).not.toHaveBeenCalled();
  });

  it('server ended reasons map to close reasons / notices', async () => {
    const ctx = setup();
    await startV2(ctx);
    ctx.transport.server('voice:state', { phase: 'ended', reason: 'max_duration' });
    expect(ctx.deps.onClose).toHaveBeenCalledWith('idle', 'maxDuration');
  });

  it('ending: voice:end via close, engine stopped, never cancels the run', async () => {
    const ctx = setup();
    await startV2(ctx);
    ctx.transport.server('voice:state', { phase: 'thinking', turnId: 't1', runId: 'run-1' });
    ctx.voice.stop('user');
    expect(ctx.transport.closed).toBe(true);
    expect(ctx.engine.stopped).toBe(true);
    expect(ctx.transport.sent('voice:interrupt')).toEqual([]);
    expect(ctx.deps.onClose).toHaveBeenCalledWith('user', null);
  });

  it('merges client and server timings per turn and sends the client marks', async () => {
    const ctx = setup();
    await startV2(ctx);
    ctx.tick(10);
    ctx.engine.frames(-20, 5); // speech start + first audio
    ctx.transport.server('voice:state', { phase: 'hearing', turnId: 't1' });
    const [clientMarks] = ctx.transport.sent('voice:timing') as { turnId: string; marks: Record<string, number> }[];
    expect(clientMarks.turnId).toBe('t1');
    expect(clientMarks.marks.speechStart).toBeTypeOf('number');
    expect(clientMarks.marks.firstAudioSent).toBeGreaterThanOrEqual(clientMarks.marks.speechStart);
    ctx.transport.server('voice:timing', { turnId: 't1', marks: { endOfTurn: 5, firstAudioOutSent: 9 } });
    ctx.transport.server('voice:audio-out', { turnId: 't1', seq: 0, pcm: pcm(100) });
    const { timings } = ctx.voice.getState();
    expect(timings?.turnId).toBe('t1');
    expect(Object.keys(timings?.marks ?? {}).sort()).toEqual(
      ['endOfTurn', 'firstAudioOutSent', 'firstAudioSent', 'playbackStart', 'speechStart'].sort(),
    );
    expect(ctx.transport.sent('voice:timing')).toHaveLength(2);
  });

  it('quiet listening ends the conversation after the idle timeout', async () => {
    const timers: { fn: () => void; ms: number }[] = [];
    const idle = setup({
      realtime: {
        idleTimeoutMs: 5000,
        setTimer: (fn, ms) => timers.push({ fn, ms }),
        clearTimer: () => {},
      },
    });
    await idle.voice.start();
    timers.filter((t) => t.ms === 5000).forEach((t) => t.fn());
    expect(idle.deps.onClose).toHaveBeenCalledWith('idle', null);
  });
});
