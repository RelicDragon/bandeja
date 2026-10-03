import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentStreamEvent } from '@shared/agentContract';
import { AgentVoiceSession, type AgentVoiceSessionDeps } from './agentVoiceSession';
import {
  VoiceStartError,
  type VoiceEngine,
  type VoiceEngineHandlers,
  type VoiceListenMode,
} from './voiceAudioEngine';

class FakeEngine implements VoiceEngine {
  handlers: VoiceEngineHandlers | null = null;
  modes: VoiceListenMode[] = [];
  played: string[] = [];
  stopPlaybackCalls = 0;
  stopped = false;
  startError: VoiceStartError | null = null;
  /** Manual playback: `play` waits until `endPlayback()`. */
  gate = false;
  private release: (() => void) | null = null;

  async start(handlers: VoiceEngineHandlers) {
    if (this.startError) throw this.startError;
    this.handlers = handlers;
  }
  setListening(mode: VoiceListenMode) {
    this.modes.push(mode);
  }
  get mode() {
    return this.modes[this.modes.length - 1] ?? 'off';
  }
  async play(audio: ArrayBuffer) {
    this.played.push(new TextDecoder().decode(audio));
    if (!this.gate) return;
    await new Promise<void>((resolve) => {
      this.release = resolve;
    });
  }
  endPlayback() {
    const release = this.release;
    this.release = null;
    release?.();
  }
  stopPlayback() {
    this.stopPlaybackCalls += 1;
    this.endPlayback();
  }
  levels() {
    return { input: 0, output: 0 };
  }
  stop() {
    this.stopped = true;
  }
  utter(text = 'audio') {
    this.handlers?.onSpeechStart();
    this.handlers?.onUtterance({ blob: new Blob([text]), durationMs: 1200 });
  }
}

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const delta = (text: string): AgentStreamEvent => ({ type: 'text.delta', text });
const completed = (status: 'COMPLETED' | 'AWAITING_CONFIRMATION' = 'COMPLETED') =>
  ({ type: 'run.completed', status, usage: { inputTokens: 1, outputTokens: 1 } }) as AgentStreamEvent;

function setup(overrides: Partial<AgentVoiceSessionDeps> = {}) {
  const engine = new FakeEngine();
  const timers: { fn: () => void; ms: number }[] = [];
  const deps = {
    createEngine: () => engine,
    transcribe: vi.fn(async () => 'Any games tomorrow?'),
    synthesize: vi.fn(async (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer),
    send: vi.fn(async () => 'run-1'),
    cancelRun: vi.fn(async () => {}),
    backlog: vi.fn(() => []),
    onClose: vi.fn(),
    setTimer: (fn: () => void, ms: number) => {
      timers.push({ fn, ms });
      return timers.length - 1;
    },
    clearTimer: (handle: unknown) => {
      timers[handle as number] = { fn: () => {}, ms: -1 };
    },
    ...overrides,
  } satisfies AgentVoiceSessionDeps;
  const session = new AgentVoiceSession(deps);
  return { engine, deps, session, timers };
}

describe('AgentVoiceSession', () => {
  beforeEach(() => vi.clearAllMocks());

  it('runs a full turn: listen → transcribe → send → speak sentence by sentence → listen', async () => {
    const { engine, deps, session } = setup();
    await session.start();
    expect(session.getState().phase).toBe('listening');
    expect(engine.mode).toBe('normal');

    engine.utter('hello');
    expect(session.getState().phase).toBe('transcribing');
    expect(engine.mode).toBe('off');
    await flush();
    expect(deps.send).toHaveBeenCalledWith('Any games tomorrow?');
    expect(session.getState()).toMatchObject({ phase: 'thinking', userCaption: 'Any games tomorrow?' });
    expect(engine.mode).toBe('bargeIn');

    session.onRunEvent('run-1', '1', delta('Two games tomorrow. '));
    session.onRunEvent('run-1', '2', delta('The best is at seven, at Club X near you. '));
    await flush();
    expect(engine.played).toEqual(['Two games tomorrow.']);
    session.onRunEvent('run-1', '3', completed());
    await flush();
    expect(engine.played).toEqual(['Two games tomorrow.', 'The best is at seven, at Club X near you.']);
    expect(session.getState().phase).toBe('listening');
    expect(engine.mode).toBe('normal');
  });

  it('ignores replayed events and other runs', async () => {
    const { engine, deps, session } = setup();
    await session.start();
    engine.utter();
    await flush();
    session.onRunEvent('run-1', '5', delta('Hello there. '));
    session.onRunEvent('run-1', '5', delta('Hello there. '));
    session.onRunEvent('run-1', '4', delta('Old. '));
    session.onRunEvent('run-2', '6', delta('Not mine. '));
    await flush();
    expect(deps.synthesize).toHaveBeenCalledTimes(1);
  });

  it('barge-in stops playback, cancels the run and captures the new turn', async () => {
    const { engine, deps, session } = setup();
    await session.start();
    engine.gate = true;
    engine.utter();
    await flush();
    session.onRunEvent('run-1', '1', delta('A long answer starts here. '));
    await flush();
    expect(session.getState().phase).toBe('speaking');

    engine.handlers?.onSpeechStart();
    expect(engine.stopPlaybackCalls).toBeGreaterThan(0);
    expect(deps.cancelRun).toHaveBeenCalledWith('run-1');
    expect(session.getState().phase).toBe('hearing');
    expect(engine.mode).toBe('normal');

    // Late events of the cancelled run are not spoken.
    session.onRunEvent('run-1', '2', delta('More text. '));
    await flush();
    expect(engine.played).toEqual(['A long answer starts here.']);

    deps.send.mockResolvedValueOnce('run-2');
    engine.handlers?.onUtterance({ blob: new Blob(['x']), durationMs: 900 });
    await flush();
    expect(deps.send).toHaveBeenCalledTimes(2);
    expect(session.followedRunId).toBe('run-2');
  });

  it('a pending write stops listening until the card is handled — voice never confirms', async () => {
    const { engine, session } = setup();
    await session.start();
    engine.utter();
    await flush();
    session.onRunEvent('run-1', '1', delta('I prepared the change. Tap Confirm on the screen. '));
    session.onRunEvent('run-1', '2', completed('AWAITING_CONFIRMATION'));
    await flush();
    expect(session.getState().phase).toBe('confirm');
    expect(engine.mode).toBe('off');

    engine.handlers?.onSpeechStart();
    expect(session.getState().phase).toBe('confirm');

    session.syncChat({ pendingAction: true, running: false });
    expect(session.getState().phase).toBe('confirm');
    session.syncChat({ pendingAction: false, running: false });
    expect(session.getState().phase).toBe('listening');
  });

  it('a reply that is only a card still says something: the confirm prompt with its title', async () => {
    const { engine, session } = setup({ confirmPrompt: (title) => `${title}. Tap Confirm on the screen.` });
    await session.start();
    engine.utter();
    await flush();
    session.onRunEvent('run-1', '1', {
      type: 'action.pending',
      action: { id: 'a1', status: 'PENDING', preview: { title: 'Change "Full invite"', lines: [], warnings: [] } },
    } as unknown as AgentStreamEvent);
    session.onRunEvent('run-1', '2', completed('AWAITING_CONFIRMATION'));
    await flush();
    expect(engine.played).toEqual(['Change "Full invite". Tap Confirm on the screen.']);
    expect(session.getState().phase).toBe('confirm');
  });

  it('no extra prompt when the model already said what it prepared', async () => {
    const confirmPrompt = vi.fn(() => 'Tap Confirm.');
    const { engine, session } = setup({ confirmPrompt });
    await session.start();
    engine.utter();
    await flush();
    session.onRunEvent('run-1', '1', delta('I prepared the move to seven. Tap Confirm on the screen. '));
    session.onRunEvent('run-1', '2', completed('AWAITING_CONFIRMATION'));
    await flush();
    expect(confirmPrompt).not.toHaveBeenCalled();
  });

  it('speaks the follow-up run after Confirm, catching up from the backlog', async () => {
    const backlog = vi.fn((runId: string) => (runId === 'run-follow' ? [{ eventId: '1', event: delta('Done, moved to seven. ') }] : []));
    const { engine, session } = setup({ backlog });
    await session.start();
    engine.utter();
    await flush();
    session.onRunEvent('run-1', '1', completed('AWAITING_CONFIRMATION'));
    await flush();
    expect(session.getState().phase).toBe('confirm');

    session.followRun('run-follow');
    session.followRun('run-follow');
    expect(backlog.mock.calls.filter(([id]) => id === 'run-follow')).toHaveLength(1);
    session.onRunEvent('run-follow', '2', completed());
    await flush();
    expect(engine.played).toEqual(['Done, moved to seven.']);
    expect(session.getState().phase).toBe('listening');
  });

  it('nothing heard → back to listening with a hint; nothing is sent', async () => {
    const { engine, deps, session } = setup({ transcribe: vi.fn(async () => '  ') });
    await session.start();
    engine.utter();
    await flush();
    expect(deps.send).not.toHaveBeenCalled();
    expect(session.getState()).toMatchObject({ phase: 'listening', notice: 'notHeard' });
  });

  it('a fatal error (budget) ends the session', async () => {
    const budget = Object.assign(new Error('429'), { response: { data: { code: 'BUDGET_EXCEEDED' } } });
    const { engine, deps, session } = setup({
      transcribe: vi.fn(async () => {
        throw budget;
      }),
      classifyError: () => ({ notice: 'budget', fatal: true }),
    });
    await session.start();
    engine.utter();
    await flush();
    expect(session.active).toBe(false);
    expect(engine.stopped).toBe(true);
    expect(deps.onClose).toHaveBeenCalledWith('error', 'budget');
  });

  it('microphone refused → closed with micDenied', async () => {
    const { engine, deps, session } = setup();
    engine.startError = new VoiceStartError('denied');
    await session.start();
    expect(session.active).toBe(false);
    expect(deps.onClose).toHaveBeenCalledWith('error', 'micDenied');
  });

  it('a quiet minute ends the session', async () => {
    const { deps, session, timers } = setup();
    await session.start();
    timers.filter((t) => t.ms > 0).at(-1)?.fn();
    expect(session.active).toBe(false);
    expect(deps.onClose).toHaveBeenCalledWith('idle', null);
  });

  it('mute turns the microphone off; tap unmutes', async () => {
    const { engine, session } = setup();
    await session.start();
    session.toggleMute();
    expect(engine.mode).toBe('off');
    session.tap();
    expect(session.getState().muted).toBe(false);
    expect(engine.mode).toBe('normal');
  });

  it('ending voice mode stops audio but never cancels the run', async () => {
    const { engine, deps, session } = setup();
    await session.start();
    engine.utter();
    await flush();
    session.stop('user');
    expect(engine.stopped).toBe(true);
    expect(deps.cancelRun).not.toHaveBeenCalled();
    expect(deps.onClose).toHaveBeenCalledWith('user', null);
  });

  it('a failed run is announced and listening resumes', async () => {
    const { engine, session } = setup();
    await session.start();
    engine.utter();
    await flush();
    session.onRunEvent('run-1', '1', { type: 'run.failed', code: 'LLM_ERROR', message: null } as AgentStreamEvent);
    await flush();
    expect(session.getState()).toMatchObject({ phase: 'listening', notice: 'runFailed' });
  });
});
