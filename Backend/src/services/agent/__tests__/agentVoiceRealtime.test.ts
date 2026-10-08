/**
 * Agent voice v2 (`/agent-voice`, docs/domains/agent.md § Voice) without DB, provider or model:
 * - pure helpers: chunker raw offsets, heard offset / truncation, PCM rechunking, WAV, energy
 *   VAD, the OpenAI transcription session config, the confirm prompt, error classification;
 * - `AgentVoiceRealtimeSession` with a fake transcription provider, a fake streaming TTS and a
 *   fake run port: a turn → voice run, ordered audio with two sentences in flight, fillers,
 *   confirm (mic ignored, follow-run, resume), barge-in (cancel + cut to what was heard), echo
 *   ignored, client interrupt (a stale turn id ignored), CHAT_BUSY retry, continuation re-send,
 *   budget, idle, silence padded only mid-speech (billed seconds), suspend / resume after a
 *   dropped link, the batch fallback (energy-VAD
 *   segmentation + WAV), usage records; transcript guards (an answer-length "transcript" is
 *   re-transcribed without the prompt, speaker echo of the reply is dropped).
 */
import assert from 'node:assert/strict';
import { SpeechChunker } from '@bandeja/shared/agentVoiceSpeech';
import type { AgentStreamEvent } from '@bandeja/shared/agentContract';
import { resolveAgentVoiceEnvConfig, type AgentVoiceEnvConfig } from '../../../config/agentVoiceEnv';
import { ApiError } from '../../../utils/ApiError';
import { agentVoiceConfirmPrompt } from '../i18n/agentVoiceI18n';
import { EnergyVad } from '../voice/realtime/agentVoiceEnergyVad';
import { heardReplyOffset, truncateHeardText } from '../voice/realtime/agentVoiceHeard';
import type { AgentRateRedisPort } from '../agentMessageRateLimit';
import { AGENT_VOICE_START_RATE_PREFIX, classifyAgentVoiceError, createAgentVoiceStartLimiter } from '../voice/realtime/agentVoiceNamespace';
import { PcmRechunker, pcmLevelDb, pcmToWav } from '../voice/realtime/agentVoicePcm';
import {
  PcmHistory,
  openAiTranscriptionSessionUpdate,
  type AgentVoiceRealtimeProviders,
  type AgentVoiceSttEvents,
  type AgentVoiceSttOptions,
} from '../voice/realtime/agentVoiceRealtimeProviders';
import {
  AgentVoiceRealtimeSession,
  type AgentVoiceDepError,
  type AgentVoiceUsage,
} from '../voice/realtime/agentVoiceRealtimeSession';
import type { AgentVoiceRunPort } from '../voice/realtime/agentVoiceRuns';

type Emitted = { event: string; payload: Record<string, unknown> };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(check: () => boolean, label: string, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for: ${label}`);
    await sleep(5);
  }
}

/** PCM16 at 24 kHz: a tone (`amp` > 0) or silence. */
function pcm(ms: number, amp = 0): Buffer {
  const samples = Math.round(24 * ms);
  const buf = Buffer.alloc(samples * 2);
  if (amp) for (let i = 0; i < samples; i++) buf.writeInt16LE(Math.round(Math.sin(i / 6) * amp), i * 2);
  return buf;
}

/** What the fake TTS says for `text`: 10 ms of audio per character, bytes tagged by the text. */
function fakeSpeech(text: string): Buffer {
  const buf = Buffer.alloc(text.length * 480);
  for (let i = 0; i < buf.length; i++) buf[i] = text.charCodeAt(i % text.length) & 0xff;
  return buf;
}

class FakeStt {
  readonly name = 'fake';
  fail = false;
  events: AgentVoiceSttEvents | null = null;
  options: AgentVoiceSttOptions | null = null;
  appendedBytes = 0;
  private unbilledBytes = 0;
  clears = 0;
  closed = false;
  async open(options: AgentVoiceSttOptions, events: AgentVoiceSttEvents) {
    if (this.fail) throw new Error('realtime down');
    this.options = options;
    this.events = events;
    return {
      kind: 'realtime' as const,
      model: options.model,
      provider: 'fake',
      append: (chunk: Buffer) => {
        this.appendedBytes += chunk.length;
        this.unbilledBytes += chunk.length;
      },
      clear: () => {
        this.clears += 1;
      },
      takeBilledMs: () => {
        const ms = this.unbilledBytes / 48;
        this.unbilledBytes = 0;
        return ms;
      },
      close: () => {
        this.closed = true;
      },
    };
  }
}

class FakeTts {
  readonly name = 'fake-tts';
  /** Extra delay before the first byte, per text (to finish sentences out of order). */
  delays = new Map<string, number>();
  failFor = new Set<string>();
  readonly calls: string[] = [];
  async *stream(input: { text: string; signal: AbortSignal }): AsyncIterable<Buffer> {
    this.calls.push(input.text);
    await sleep(this.delays.get(input.text) ?? 5);
    if (this.failFor.has(input.text)) throw new Error('tts down');
    const audio = fakeSpeech(input.text);
    // Odd-sized pieces: the session re-chunks them into whole frames.
    for (let at = 0; at < audio.length; at += 2001) {
      if (input.signal.aborted) return;
      yield audio.subarray(at, Math.min(audio.length, at + 2001));
      await sleep(1);
    }
  }
}

type Followed = { runId: string; onEvent: (event: AgentStreamEvent) => void; onEnd: () => void; closed: boolean };

class FakeRuns implements AgentVoiceRunPort {
  readonly sends: { text: string; editMessageId: string | null; locale: string | null; merged: boolean }[] = [];
  readonly cancels: string[] = [];
  readonly truncations: { runId: string; streamedText: string; heardOffset: number }[] = [];
  readonly followed = new Map<string, Followed>();
  /** Errors thrown by the next sends, in order. */
  sendErrors: unknown[] = [];
  private seq = 0;
  async send(input: Parameters<AgentVoiceRunPort['send']>[0]) {
    const error = this.sendErrors.shift();
    if (error) throw error;
    this.seq += 1;
    this.sends.push({ text: input.text, editMessageId: input.editMessageId ?? null, locale: input.locale, merged: input.merged === true });
    return { runId: `run-${this.seq}`, messageId: `msg-${this.seq}` };
  }
  async cancel(_userId: string, runId: string) {
    this.cancels.push(runId);
  }
  async follow(input: Parameters<AgentVoiceRunPort['follow']>[0]) {
    if (input.runId === 'foreign') return null;
    const entry: Followed = { runId: input.runId, onEvent: input.onEvent, onEnd: input.onEnd, closed: false };
    this.followed.set(input.runId, entry);
    return {
      close: () => {
        if (entry.closed) return;
        entry.closed = true;
        input.onEnd();
      },
    };
  }
  async latestClientCaps() {
    return null;
  }
  async truncateReply(input: { runId: string; streamedText: string; heardOffset: number }) {
    this.truncations.push(input);
  }
  run(runId: string): Followed {
    const entry = this.followed.get(runId);
    assert.ok(entry, `run ${runId} followed`);
    return entry;
  }
}

function harness(options: { config?: (c: AgentVoiceEnvConfig) => AgentVoiceEnvConfig; budget?: () => AgentVoiceDepError | null; batch?: AgentVoiceRealtimeProviders['batch'] } = {}) {
  const base = resolveAgentVoiceEnvConfig({ AGENT_VOICE_REALTIME_FILLER_DELAY_MS: '40' });
  const config = options.config ? options.config(base) : base;
  const stt = new FakeStt();
  const tts = new FakeTts();
  const runs = new FakeRuns();
  const emitted: Emitted[] = [];
  const usage: AgentVoiceUsage[] = [];
  const logs: string[] = [];
  const ended: string[] = [];
  const session = new AgentVoiceRealtimeSession({
    sessionId: 'sess-0000-test',
    user: { id: 'user-1', isAdmin: false },
    chatId: 'chat-1',
    locale: 'en',
    clientCaps: null,
    muted: false,
    config,
    providers: { stt, tts, batch: options.batch ?? null },
    runs,
    emit: (event, payload) => emitted.push({ event, payload: payload as unknown as Record<string, unknown> }),
    vocabulary: async () => 'Bandeja, padel',
    checkBudget: async () => options.budget?.() ?? null,
    recordUsage: async (entry) => {
      usage.push(entry);
    },
    classifyError: classifyAgentVoiceError,
    onEnded: (reason) => ended.push(reason),
    log: (line) => logs.push(line),
  });
  const of = (event: string) => emitted.filter((e) => e.event === event);
  const phases = () => of('voice:state').map((e) => e.payload.phase);
  const lastPhase = () => phases().at(-1);
  return { session, stt, tts, runs, emitted, usage, logs, ended, of, phases, lastPhase, config };
}

/** User speaks `text` and the provider commits it. */
async function speak(h: ReturnType<typeof harness>, text: string, itemId = `item-${Math.random()}`): Promise<void> {
  const events = h.stt.events!;
  h.session.audio(pcm(200, 3000));
  events.speechStarted();
  events.delta(itemId, text.slice(0, 4));
  events.speechStopped();
  events.completed(itemId, text);
}

function pureCases(): void {
  // Chunker pieces map back onto the pushed markdown.
  const chunker = new SpeechChunker();
  const pushed = 'Two **games** tomorrow. The best one is at seven at Padel Arena, see [here](/g/1). ';
  const pieces = [...chunker.pushPieces(pushed), ...chunker.flushPieces()];
  assert.equal(pieces[0].text, 'Two games tomorrow.');
  for (const piece of pieces) assert.equal(pushed.slice(piece.rawStart, piece.rawEnd), piece.raw);
  assert.deepEqual(new SpeechChunker().push('Hello there friend. '), ['Hello there friend.'], 'string API unchanged');

  // Heard offset: whole sentences played + the played share of the current one, at a word boundary.
  const streamed = 'First sentence here. Second sentence is a bit longer. ';
  const items = [
    { kind: 'progress' as const, text: 'Checking…', rawStart: 0, rawEnd: 0, bytesSent: 4800, complete: true },
    { kind: 'reply' as const, text: 'First sentence here.', rawStart: 0, rawEnd: 21, bytesSent: 9600, complete: true },
    { kind: 'reply' as const, text: 'Second sentence is a bit longer.', rawStart: 21, rawEnd: 54, bytesSent: 9600, complete: true },
  ];
  assert.equal(heardReplyOffset(items, 50, streamed), 0, 'only the filler was playing');
  assert.equal(heardReplyOffset(items, 100 + 200, streamed), 21, 'filler + first sentence');
  const mid = heardReplyOffset(items, 100 + 200 + 100, streamed);
  assert.ok(mid > 21 && mid < 54 && streamed[mid] === ' ', `half of the second sentence, cut at a space (${mid})`);
  assert.equal(heardReplyOffset(items, 10_000, streamed), 54);
  assert.equal(truncateHeardText('First sentence here. Second one.', 0, 21), 'First sentence here. …');
  assert.equal(truncateHeardText('The best one is at seven.', 0, 18), 'The best one is at…');
  assert.equal(truncateHeardText('Second one.', 21, 21), '…');
  assert.equal(truncateHeardText('All of it.', 0, 99), null);

  // PCM helpers.
  const rechunker = new PcmRechunker(4);
  assert.deepEqual(rechunker.push(Buffer.from([1, 2, 3])).length, 0);
  assert.deepEqual(rechunker.push(Buffer.from([4, 5, 6, 7])).map((b) => [...b]), [[1, 2, 3, 4]]);
  assert.deepEqual([...(rechunker.flush() ?? [])], [5, 6], 'odd trailing byte dropped');
  const wav = pcmToWav(pcm(100, 1000), 24_000);
  assert.equal(wav.subarray(0, 4).toString(), 'RIFF');
  assert.equal(wav.readUInt32LE(24), 24_000);
  assert.equal(wav.length, 44 + 4800);
  assert.ok(pcmLevelDb(pcm(20)) <= -99 && pcmLevelDb(pcm(20, 8000)) > -20);

  // Energy VAD: calibrates on silence, then start / end; a click is discarded.
  const vad = new EnergyVad();
  const run = (ms: number, db: number) => {
    const out: string[] = [];
    for (let t = 0; t < ms; t += 20) {
      const event = vad.process(db, 20);
      if (event) out.push(event);
    }
    return out;
  };
  assert.deepEqual(run(400, -70), []);
  assert.deepEqual(run(600, -20), ['start']);
  assert.deepEqual(run(900, -70), ['end']);
  assert.deepEqual([...run(120, -20), ...run(900, -70)], ['start', 'discard']);

  // OpenAI transcription session config (GA shape).
  const base: AgentVoiceSttOptions = { model: 'gpt-4o-transcribe', url: 'wss://x', prompt: 'Bandeja', turnDetection: 'semantic_vad', eagerness: 'high', silenceMs: 500, timeoutMs: 1000 };
  const update = openAiTranscriptionSessionUpdate(base) as { type: string; session: { type: string; audio: { input: Record<string, unknown> } } };
  assert.equal(update.type, 'session.update');
  assert.equal(update.session.type, 'transcription');
  assert.deepEqual(update.session.audio.input.format, { type: 'audio/pcm', rate: 24_000 });
  assert.deepEqual(update.session.audio.input.transcription, { model: 'gpt-4o-transcribe', prompt: 'Bandeja' });
  assert.deepEqual(update.session.audio.input.turn_detection, { type: 'semantic_vad', eagerness: 'high' });
  const serverVad = openAiTranscriptionSessionUpdate({ ...base, turnDetection: 'server_vad' }) as typeof update;
  assert.equal((serverVad.session.audio.input.turn_detection as { silence_duration_ms: number }).silence_duration_ms, 500);
  assert.equal((openAiTranscriptionSessionUpdate({ ...base, turnDetection: 'none' }) as typeof update).session.audio.input.turn_detection, null);

  // Spoken confirm prompt, localized.
  assert.equal(agentVoiceConfirmPrompt('en', 'Join "Sunday"'), 'Join "Sunday". Tap Confirm on the screen.');
  assert.equal(agentVoiceConfirmPrompt('ru-RU', null), 'Нажмите «Подтвердить» на экране.');

  // Error classification.
  assert.equal(classifyAgentVoiceError(new ApiError(409, 'busy', true, { code: 'CHAT_BUSY' })).code, 'CHAT_BUSY');
  assert.deepEqual(classifyAgentVoiceError(new ApiError(429, 'x', true, { code: 'BUDGET_EXCEEDED', retryAt: '2026-01-01T00:00:00.000Z' })), {
    code: 'BUDGET_EXCEEDED',
    message: 'x',
    retryAt: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(classifyAgentVoiceError(new ApiError(404, 'Chat not found')).code, 'NOT_FOUND');
  assert.equal(classifyAgentVoiceError(new Error('boom')).code, 'INTERNAL');

  // Config defaults.
  const defaults = resolveAgentVoiceEnvConfig({}).realtime;
  assert.equal(defaults.enabled, true);
  assert.equal(defaults.sttModel, 'gpt-4o-transcribe');
  assert.equal(defaults.turnDetection, 'semantic_vad');
  assert.equal(resolveAgentVoiceEnvConfig({ AGENT_VOICE_REALTIME_ENABLED: 'false' }).realtime.enabled, false);
  assert.equal(resolveAgentVoiceEnvConfig({ AGENT_VOICE_REALTIME_TURN_DETECTION: 'bogus' }).realtime.turnDetection, 'semantic_vad');
}

/** `voice:start` limit: one Redis bucket across processes; in memory without Redis. */
async function startLimit(): Promise<void> {
  const limits = () => ({ windowMs: 60_000, max: 2 });
  const counters = new Map<string, number>();
  const shared: AgentRateRedisPort = {
    async increment(key) {
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return { totalHits: next, ttlMs: 30_000 };
    },
    async decrement() {},
    async reset(key) {
      counters.delete(key);
    },
  };
  const a = createAgentVoiceStartLimiter(shared, limits);
  const b = createAgentVoiceStartLimiter(shared, limits);
  assert.deepEqual(await a.consume('u1'), { ok: true });
  assert.deepEqual(await b.consume('u1'), { ok: true });
  const denied = await a.consume('u1');
  assert.equal(denied.ok, false, 'the second process counted the first one');
  assert.ok(!denied.ok && denied.retryAt && Date.parse(denied.retryAt) > Date.now() + 20_000, 'retryAt = window end');
  assert.equal(counters.get(`${AGENT_VOICE_START_RATE_PREFIX}u1`), 3);
  assert.deepEqual(await b.consume('u2'), { ok: true }, 'per user');

  const local1 = createAgentVoiceStartLimiter(null, limits);
  const local2 = createAgentVoiceStartLimiter(null, limits);
  assert.deepEqual(await local1.consume('u1'), { ok: true });
  assert.deepEqual(await local1.consume('u1'), { ok: true });
  assert.equal((await local1.consume('u1')).ok, false, 'memory fallback limits');
  assert.deepEqual(await local2.consume('u1'), { ok: true }, 'memory is per process');
  for (const limiter of [a, b, local1, local2]) limiter.shutdown();
}

async function turnAndOrderedSpeech(): Promise<void> {
  const h = harness();
  await h.session.start();
  assert.equal(h.lastPhase(), 'listening');
  assert.equal(h.stt.options?.model, 'gpt-4o-transcribe');
  assert.equal(h.stt.options?.prompt, 'Bandeja, padel', 'vocabulary prompt');

  await speak(h, 'Find me a game tomorrow', 'i1');
  assert.deepEqual(h.phases().slice(1, 3), ['hearing', 'thinking']);
  const partial = h.of('voice:caption').find((e) => e.payload.final === false);
  assert.equal(partial?.payload.text, 'Find');
  const final = h.of('voice:caption').find((e) => e.payload.final === true);
  assert.equal(final?.payload.text, 'Find me a game tomorrow');
  await waitFor(() => h.of('voice:turn').length === 1, 'voice:turn');
  assert.deepEqual(h.runs.sends, [{ text: 'Find me a game tomorrow', editMessageId: null, locale: 'en', merged: false }]);
  const turnId = h.of('voice:turn')[0].payload.turnId as string;
  assert.equal(h.of('voice:turn')[0].payload.runId, 'run-1');
  assert.ok(h.usage.some((u) => u.kind === 'realtime_transcription' && u.amount > 0), 'transcription usage flushed at the turn');

  const run = h.runs.run('run-1');
  const first = 'Two games tomorrow.';
  const second = 'The best one is at seven at Padel Arena, on court two.';
  // The second sentence's audio is ready first: it must still play second.
  h.tts.delays.set(first, 80);
  h.tts.delays.set(second, 0);
  run.onEvent({ type: 'run.started', runId: 'run-1', chatId: 'chat-1' });
  run.onEvent({ type: 'text.delta', text: `${first} ` });
  run.onEvent({ type: 'text.delta', text: `${second} ` });
  run.onEvent({ type: 'run.completed', status: 'COMPLETED', usage: { inputTokens: 1, outputTokens: 1 } });
  await waitFor(() => h.of('voice:audio-end').length === 1, 'audio-end');
  assert.deepEqual(h.tts.calls, [first, second]);

  // Text before its audio, audio strictly in order, seq contiguous.
  const order = h.emitted.filter((e) => e.event === 'voice:speech-text' || e.event === 'voice:audio-out');
  assert.equal(order[0].event, 'voice:speech-text');
  assert.equal(order[0].payload.text, first);
  const secondTextAt = order.findIndex((e) => e.event === 'voice:speech-text' && e.payload.text === second);
  const audio = h.of('voice:audio-out');
  assert.deepEqual(audio.map((e) => e.payload.seq), audio.map((_, i) => i));
  const firstAudioCount = Math.ceil(fakeSpeech(first).length / 7200);
  assert.equal(secondTextAt, 1 + firstAudioCount, 'second text right after the first sentence audio');
  const received = Buffer.concat(audio.map((e) => e.payload.pcm as Buffer));
  assert.ok(received.equals(Buffer.concat([fakeSpeech(first), fakeSpeech(second)])), 'audio bytes in order');
  assert.ok(audio.every((e) => (e.payload.pcm as Buffer).length <= 7200), '~150 ms frames');
  assert.equal(h.of('voice:speech-text')[0].payload.kind, 'reply');
  assert.ok(h.phases().includes('speaking'));
  const timing = h.of('voice:timing')[0]?.payload as { turnId: string; marks: Record<string, number> };
  assert.equal(timing.turnId, turnId);
  for (const mark of ['endOfTurn', 'transcriptFinal', 'runQueued', 'runStarted', 'firstTextDelta', 'firstSentence', 'ttsRequested', 'firstTtsByte', 'firstAudioOutSent']) {
    assert.equal(typeof timing.marks[mark], 'number', `timing mark ${mark}`);
  }

  // Still speaking until the client says it played everything.
  assert.equal(h.lastPhase(), 'speaking');
  h.session.clientTiming(turnId, { playbackStart: Date.now() });
  h.session.playback(turnId, 500, false);
  assert.equal(h.lastPhase(), 'speaking');
  h.session.playback(turnId, 4000, true);
  assert.equal(h.lastPhase(), 'listening');
  assert.equal(h.logs.length, 1);
  assert.match(h.logs[0], /^\[agent-voice\] turn=\S+ run=run-1 eot→final=\d+ms final→runStarted=\d+ms →firstDelta=\d+ms →firstTtsByte=\d+ms →firstAudioOut=\d+ms →playback=-?\d+ms total=\d+ms outcome=completed stt=realtime$/);
  const speech = h.usage.filter((u) => u.kind === 'speech');
  assert.deepEqual(speech.map((u) => u.amount).sort(), [first.length, second.length].sort(), '1 per spoken char');

  h.session.end('user');
  assert.equal(h.lastPhase(), 'ended');
  assert.equal(h.of('voice:state').at(-1)?.payload.reason, 'user');
  assert.deepEqual(h.ended, ['user']);
  assert.ok(h.stt.closed);
  assert.deepEqual(h.runs.cancels, [], 'ending never cancels a run');
}

async function fillerAndFailures(): Promise<void> {
  const h = harness();
  await h.session.start();
  await speak(h, 'What games do I have');
  await waitFor(() => h.runs.followed.has('run-1'), 'follow');
  const run = h.runs.run('run-1');
  run.onEvent({ type: 'run.started', runId: 'run-1', chatId: 'chat-1' });
  run.onEvent({ type: 'tool.started', callId: 'c1', name: 'list_my_games', label: 'Looking up your games' });
  await waitFor(() => h.of('voice:speech-text').length === 1, 'filler');
  assert.deepEqual(
    { kind: h.of('voice:speech-text')[0].payload.kind, text: h.of('voice:speech-text')[0].payload.text },
    { kind: 'progress', text: 'Looking up your games…' },
  );
  run.onEvent({ type: 'tool.finished', callId: 'c1', name: 'list_my_games', ok: true, summary: 'x', label: 'x' } as unknown as AgentStreamEvent);
  run.onEvent({ type: 'tool.started', callId: 'c2', name: 'get_game', label: 'Opening the game' });
  await sleep(150);
  assert.equal(h.of('voice:speech-text').length, 1, 'one filler per turn (a second only after ~4 s)');
  run.onEvent({ type: 'text.delta', text: 'You have one game on Sunday. ' });
  run.onEvent({ type: 'run.completed', status: 'COMPLETED', usage: { inputTokens: 1, outputTokens: 1 } });
  await waitFor(() => h.of('voice:audio-end').length === 1, 'audio-end');
  assert.deepEqual(h.of('voice:speech-text').map((e) => e.payload.seq), [0, 1]);
  const turnId = h.of('voice:audio-end')[0].payload.turnId as string;
  h.session.playback(turnId, 99_999, true);
  assert.equal(h.lastPhase(), 'listening');

  // TTS failing: a non-fatal error, the turn still ends.
  await speak(h, 'And tomorrow');
  await waitFor(() => h.runs.followed.has('run-2'), 'follow 2');
  h.tts.failFor.add('Nothing tomorrow.');
  const run2 = h.runs.run('run-2');
  run2.onEvent({ type: 'text.delta', text: 'Nothing tomorrow.' });
  run2.onEvent({ type: 'run.completed', status: 'COMPLETED', usage: { inputTokens: 1, outputTokens: 1 } });
  await waitFor(() => h.lastPhase() === 'listening' && h.of('voice:audio-end').length === 2, 'back to listening');
  assert.equal(h.of('voice:error').at(-1)?.payload.code, 'VOICE_UNAVAILABLE');
  assert.equal(h.of('voice:error').at(-1)?.payload.fatal, false);

  // A failed run: error after the turn, listening again.
  await speak(h, 'Third question');
  await waitFor(() => h.runs.followed.has('run-3'), 'follow 3');
  h.runs.run('run-3').onEvent({ type: 'run.failed', code: 'LLM_ERROR', message: 'The AI service is unavailable right now' });
  await waitFor(() => h.of('voice:error').length === 2, 'run failure');
  assert.equal(h.of('voice:error')[1].payload.code, 'INTERNAL');
  assert.equal(h.lastPhase(), 'listening');
  h.session.end('user');
}

/** Voice runs stream a short line before a tool call unheld: it is spoken at `tool.started`, no filler. */
async function spokenNarrationCoversTheWait(): Promise<void> {
  const h = harness();
  await h.session.start();
  await speak(h, 'What games do I have');
  await waitFor(() => h.runs.followed.has('run-1'), 'follow');
  const run = h.runs.run('run-1');
  run.onEvent({ type: 'run.started', runId: 'run-1', chatId: 'chat-1' });
  // No trailing space: the chunker alone would wait for more text.
  run.onEvent({ type: 'text.delta', text: 'Let me check your games.' });
  assert.equal(h.of('voice:speech-text').length, 0, 'held by the chunker until the sentence is complete');
  run.onEvent({ type: 'tool.started', callId: 'c1', name: 'list_my_games', label: 'Looking up your games' });
  await waitFor(() => h.of('voice:speech-text').length === 1, 'narration spoken');
  assert.deepEqual(
    { kind: h.of('voice:speech-text')[0].payload.kind, text: h.of('voice:speech-text')[0].payload.text },
    { kind: 'reply', text: 'Let me check your games.' },
  );
  await sleep(150);
  assert.equal(h.of('voice:speech-text').length, 1, 'no filler once the narration was said');
  run.onEvent({ type: 'tool.finished', callId: 'c1', name: 'list_my_games', ok: true, summary: 'x', label: 'x' } as unknown as AgentStreamEvent);
  run.onEvent({ type: 'text.delta', text: 'You have one game on Sunday.' });
  run.onEvent({ type: 'run.completed', status: 'COMPLETED', usage: { inputTokens: 1, outputTokens: 1 } });
  await waitFor(() => h.of('voice:audio-end').length === 1, 'audio-end');
  assert.deepEqual(h.tts.calls, ['Let me check your games.', 'You have one game on Sunday.']);
  h.session.end('user');
}

async function confirmFlow(): Promise<void> {
  const h = harness();
  await h.session.start();
  await speak(h, 'Join the Sunday game');
  await waitFor(() => h.runs.followed.has('run-1'), 'follow');
  const run = h.runs.run('run-1');
  run.onEvent({
    type: 'action.pending',
    action: { status: 'PENDING', preview: { title: 'Join "Sunday game"' } },
  } as unknown as AgentStreamEvent);
  run.onEvent({ type: 'run.completed', status: 'AWAITING_CONFIRMATION', usage: { inputTokens: 1, outputTokens: 1 } });
  await waitFor(() => h.of('voice:audio-end').length === 1, 'audio-end');
  const prompt = h.of('voice:speech-text')[0].payload;
  assert.equal(prompt.kind, 'confirm');
  assert.equal(prompt.text, 'Join "Sunday game". Tap Confirm on the screen.');
  h.session.playback(prompt.turnId as string, 99_999, true);
  const state = h.of('voice:state').at(-1)!.payload;
  assert.equal(state.phase, 'confirm');
  assert.equal(state.confirmTitle, 'Join "Sunday game"');

  // Mic ignored while a card waits; a spoken "yes" does nothing.
  const before = h.stt.appendedBytes;
  h.session.audio(pcm(100, 3000));
  assert.equal(h.stt.appendedBytes, before, 'mic frames ignored in confirm');
  h.stt.events!.speechStarted();
  h.stt.events!.delta('yes-1', 'yes');
  h.stt.events!.completed('yes-1', 'Yes');
  await sleep(20);
  assert.equal(h.runs.sends.length, 1, 'no run from a spoken yes');
  assert.equal(h.lastPhase(), 'confirm');

  // Tapped Confirm → the follow-up run is followed and spoken.
  await h.session.followRun('run-follow');
  assert.equal(h.of('voice:state').at(-1)?.payload.runId, 'run-follow');
  assert.equal(h.lastPhase(), 'thinking');
  const follow = h.runs.run('run-follow');
  follow.onEvent({ type: 'text.delta', text: "Done, you're in the game." });
  follow.onEvent({ type: 'run.completed', status: 'COMPLETED', usage: { inputTokens: 1, outputTokens: 1 } });
  await waitFor(() => h.of('voice:audio-end').length === 2, 'follow-up spoken');
  h.session.playback(h.of('voice:audio-end')[1].payload.turnId as string, 99_999, true);
  assert.equal(h.lastPhase(), 'listening');

  // A foreign run id: non-fatal NOT_FOUND.
  await h.session.followRun('foreign');
  assert.equal(h.of('voice:error').at(-1)?.payload.code, 'NOT_FOUND');
  assert.equal(h.lastPhase(), 'listening');

  // Reject tapped → resume.
  h.session.resume();
  assert.equal(h.lastPhase(), 'listening');
  h.session.end('user');
}

async function bargeIn(): Promise<void> {
  const h = harness();
  await h.session.start();
  await speak(h, 'Tell me about my games');
  await waitFor(() => h.runs.followed.has('run-1'), 'follow');
  const run = h.runs.run('run-1');
  const first = 'You have three games this week.';
  const second = 'The first one is on Monday evening at the club near your home, with Ana and Ben.';
  run.onEvent({ type: 'text.delta', text: `${first} ${second} And the rest` });
  await waitFor(() => h.of('voice:speech-text').length === 2 && h.lastPhase() === 'speaking', 'speaking');
  await sleep(100);
  const turnId = h.of('voice:speech-text')[0].payload.turnId as string;

  // Speaker echo: a short blip is not a barge-in.
  h.stt.events!.speechStarted();
  await sleep(60);
  h.stt.events!.speechStopped();
  await sleep(350);
  assert.equal(h.of('voice:stop-playback').length, 0, 'short echo ignored');
  h.stt.events!.completed('echo', '');
  assert.equal(h.lastPhase(), 'speaking');

  // Heard: all of the first sentence and about half of the second.
  const firstMs = first.length * 10;
  h.session.playback(turnId, firstMs + (second.length * 10) / 2, false);
  h.stt.events!.speechStarted();
  h.stt.events!.delta('b1', 'wait');
  assert.equal(h.of('voice:stop-playback').length, 1);
  assert.equal(h.of('voice:stop-playback')[0].payload.turnId, turnId);
  assert.equal(h.lastPhase(), 'hearing');
  await waitFor(() => h.runs.truncations.length === 1, 'truncation');
  assert.deepEqual(h.runs.cancels, ['run-1']);
  const cut = h.runs.truncations[0];
  assert.equal(cut.runId, 'run-1');
  assert.ok(cut.heardOffset > first.length && cut.heardOffset < first.length + 1 + second.length, `cut inside the second sentence (${cut.heardOffset})`);
  const audioBefore = h.of('voice:audio-out').length;
  await sleep(50);
  assert.equal(h.of('voice:audio-out').length, audioBefore, 'no audio after the stop');

  // The new turn goes on normally.
  h.stt.events!.speechStopped();
  h.stt.events!.completed('b1', 'Wait, only Sunday');
  await waitFor(() => h.runs.sends.length === 2, 'second send');
  assert.equal(h.runs.sends[1].text, 'Wait, only Sunday');
  assert.equal(h.runs.sends[1].editMessageId, null, 'a reply was spoken: a new turn, not a continuation');
  assert.equal(h.runs.sends[1].merged, false, 'a new turn counts');

  // A stale interrupt (an older turn's id) never cancels the newer turn.
  await waitFor(() => h.runs.followed.has('run-2'), 'follow 2');
  const secondTurnId = h.of('voice:turn')[1].payload.turnId as string;
  assert.notEqual(secondTurnId, turnId);
  h.session.interrupt(0, turnId);
  await sleep(30);
  assert.equal(h.runs.cancels.length, 1, 'stale interrupt ignored');
  assert.equal(h.lastPhase(), 'thinking');

  // Client-side interrupt (orb tap) while thinking: cancel, listening.
  h.session.interrupt(0, secondTurnId);
  await waitFor(() => h.runs.cancels.length === 2, 'cancel 2');
  assert.equal(h.runs.cancels[1], 'run-2');
  assert.equal(h.lastPhase(), 'listening');
  h.session.end('user');
}

async function continuationBusyBudgetIdle(): Promise<void> {
  // The user goes on talking before anything was said: re-sent over the first message.
  let h = harness();
  await h.session.start();
  await speak(h, 'Find a game', 'c1');
  await waitFor(() => h.runs.followed.has('run-1'), 'follow');
  await speak(h, 'on Sunday evening', 'c2');
  await waitFor(() => h.runs.sends.length === 2, 'continuation');
  assert.deepEqual(
    h.runs.sends[1],
    { text: 'Find a game on Sunday evening', editMessageId: 'msg-1', locale: 'en', merged: true },
    'merged over the first message: not charged to the message quota again',
  );
  assert.deepEqual(h.runs.cancels, ['run-1']);
  h.session.end('user');

  // CHAT_BUSY on send: the previous run of this session is cancelled and the send retried.
  h = harness();
  await h.session.start();
  await speak(h, 'First question');
  await waitFor(() => h.runs.followed.has('run-1'), 'follow');
  const run = h.runs.run('run-1');
  run.onEvent({ type: 'text.delta', text: 'An answer that is being spoken. ' });
  await waitFor(() => h.lastPhase() === 'speaking', 'speaking');
  h.runs.sendErrors.push(new ApiError(409, 'busy', true, { code: 'CHAT_BUSY' }));
  h.stt.events!.speechStarted();
  h.stt.events!.delta('x', 'Second');
  h.stt.events!.completed('x', 'Second question');
  await waitFor(() => h.runs.sends.length === 2, 'retried');
  assert.ok(h.runs.cancels.filter((id) => id === 'run-1').length >= 1);
  assert.equal(h.runs.sends[1].text, 'Second question');
  h.session.end('user');

  // Rate limited send: non-fatal, listening.
  h = harness();
  await h.session.start();
  h.runs.sendErrors.push(new ApiError(429, 'Too many', true, { code: 'RATE_LIMITED' }));
  await speak(h, 'Hello there');
  await waitFor(() => h.of('voice:error').length === 1, 'rate limited');
  assert.deepEqual([h.of('voice:error')[0].payload.code, h.of('voice:error')[0].payload.fatal], ['RATE_LIMITED', false]);
  assert.equal(h.lastPhase(), 'listening');
  h.session.end('user');

  // Over budget at a turn: fatal.
  let over = false;
  h = harness({ budget: () => (over ? { code: 'BUDGET_EXCEEDED', message: 'Daily limit', retryAt: '2030-01-01T00:00:00.000Z' } : null) });
  await h.session.start();
  over = true;
  await speak(h, 'One more question');
  await waitFor(() => h.ended.length === 1, 'ended');
  const error = h.of('voice:error')[0].payload;
  assert.deepEqual([error.code, error.fatal, error.retryAt], ['BUDGET_EXCEEDED', true, '2030-01-01T00:00:00.000Z']);
  assert.equal(h.of('voice:state').at(-1)?.payload.reason, 'error');
  assert.equal(h.runs.sends.length, 0);

  // Silence ends the session.
  h = harness({ config: (c) => ({ ...c, realtime: { ...c.realtime, idleMs: 80 } }) });
  await h.session.start();
  await waitFor(() => h.ended.length === 1, 'idle');
  assert.equal(h.of('voice:state').at(-1)?.payload.reason, 'idle');

  // Session cap.
  h = harness({ config: (c) => ({ ...c, realtime: { ...c.realtime, maxSessionMs: 60 } }) });
  await h.session.start();
  await waitFor(() => h.ended.length === 1, 'max duration');
  assert.equal(h.of('voice:state').at(-1)?.payload.reason, 'max_duration');

  // Muted: frames ignored.
  h = harness();
  await h.session.start();
  h.session.setMuted(true);
  h.session.audio(pcm(100, 3000));
  assert.equal(h.stt.appendedBytes, 0);
  h.session.setMuted(false);
  h.session.audio(pcm(100, 3000));
  assert.equal(h.stt.appendedBytes, 4800);
  h.session.end('user');
}

async function gapFillOnlyMidSpeech(): Promise<void> {
  const h = harness();
  await h.session.start();
  const bytesPerMs = 48;
  // The gated app sends a burst, then nothing. No speech open at the provider: nothing is padded.
  h.session.audio(pcm(200, 3000));
  await sleep(400);
  assert.equal(h.stt.appendedBytes, 200 * bytesPerMs, 'no padding without open speech');
  // Speech open (the stream stopped mid-utterance): silence is padded so the turn can end…
  h.stt.events!.speechStarted();
  await sleep(500);
  const padded = h.stt.appendedBytes - 200 * bytesPerMs;
  assert.ok(padded > 0 && padded <= 500 * bytesPerMs, `padded ${padded / bytesPerMs} ms`);
  // …and stops once the provider ends it.
  h.stt.events!.speechStopped();
  const sent = h.stt.appendedBytes;
  await sleep(300);
  assert.equal(h.stt.appendedBytes, sent, 'no padding after the speech stopped');
  // Billed seconds = audio sent + padding, nothing for the quiet stretches.
  h.session.end('user');
  const billed = h.usage.filter((u) => u.kind === 'realtime_transcription').reduce((n, u) => n + u.amount, 0);
  assert.equal(billed, sent / bytesPerMs);
}

async function suspendAndResume(): Promise<void> {
  const h = harness({ config: (c) => ({ ...c, realtime: { ...c.realtime, idleMs: 120 } }) });
  await h.session.start();
  h.session.audio(pcm(100, 3000));
  const sent = h.stt.appendedBytes;
  // The link drops mid-speech: the capture is dropped, STT cleared and billed up to here.
  h.stt.events!.speechStarted();
  assert.equal(h.lastPhase(), 'hearing');
  h.session.suspend();
  assert.ok(h.session.isSuspended);
  assert.ok(h.stt.clears >= 1, 'STT input cleared');
  assert.equal(h.lastPhase(), 'listening');
  assert.ok(h.usage.some((u) => u.kind === 'realtime_transcription' && u.amount === 100), 'usage flushed at the drop');
  h.session.audio(pcm(100, 3000));
  await sleep(300);
  assert.equal(h.stt.appendedBytes, sent, 'nothing streamed or padded while suspended');
  assert.deepEqual(h.ended, [], 'no idle end while suspended');

  // Resumed: the current phase is re-sent, audio flows again, the idle clock is back.
  const states = h.of('voice:state').length;
  h.session.resumeTransport();
  assert.equal(h.of('voice:state').length, states + 1);
  assert.equal(h.lastPhase(), 'listening');
  h.session.audio(pcm(100, 3000));
  assert.equal(h.stt.appendedBytes, sent + 4800);
  await waitFor(() => h.ended.length === 1, 'idle after the resume');
  assert.deepEqual(h.ended, ['idle']);

  // A drop while the run is live keeps the turn: the run isn't cancelled, its phase comes back.
  const t = harness();
  await t.session.start();
  await speak(t, 'Find me a game');
  await waitFor(() => t.runs.followed.has('run-1'), 'follow');
  t.session.suspend();
  t.runs.run('run-1').onEvent({ type: 'text.delta', text: 'You have one game. ' });
  t.runs.run('run-1').onEvent({ type: 'run.completed', status: 'COMPLETED', usage: { inputTokens: 1, outputTokens: 1 } });
  await waitFor(() => t.lastPhase() === 'speaking', 'speaking while suspended');
  t.session.resumeTransport();
  const last = t.of('voice:state').at(-1)!.payload;
  assert.equal(last.phase, 'speaking');
  assert.equal(last.turnId, t.of('voice:turn')[0].payload.turnId);
  assert.deepEqual(t.runs.cancels, []);
  t.session.end('disconnected');
  assert.equal(t.of('voice:state').at(-1)?.payload.reason, 'disconnected');
}

async function batchFallback(): Promise<void> {
  const wavs: Buffer[] = [];
  const h = harness({
    batch: {
      name: 'fake-batch',
      model: 'gpt-4o-mini-transcribe',
      transcribe: async ({ wav }) => {
        wavs.push(wav);
        return 'Hello there';
      },
    },
  });
  h.stt.fail = true;
  // Frames sent while connecting are kept and replayed into the fallback.
  const starting = h.session.start();
  h.session.audio(pcm(400));
  await starting;
  for (let t = 0; t < 600; t += 20) h.session.audio(pcm(20, 8000));
  for (let t = 0; t < 1200; t += 20) h.session.audio(pcm(20));
  await waitFor(() => h.runs.sends.length === 1, 'fallback turn');
  assert.equal(h.runs.sends[0].text, 'Hello there');
  assert.deepEqual(h.phases().slice(1, 3), ['hearing', 'thinking']);
  assert.equal(wavs.length, 1);
  assert.equal(wavs[0].subarray(0, 4).toString(), 'RIFF');
  assert.ok(wavs[0].length > 44 + 600 * 48, 'utterance audio (+ pre-roll) uploaded as WAV');
  assert.ok(h.usage.some((u) => u.kind === 'batch_transcription' && u.provider === 'fake-batch' && u.amount >= 600));
  h.session.end('user');

  // No fallback configured: fatal VOICE_UNAVAILABLE.
  const none = harness();
  none.stt.fail = true;
  await none.session.start();
  assert.equal(none.of('voice:error')[0]?.payload.code, 'VOICE_UNAVAILABLE');
  assert.deepEqual(none.ended, ['error']);

  // Realtime dropping mid-session switches to the fallback.
  const drop = harness({ batch: { name: 'fake-batch', model: 'm', transcribe: async () => 'After the drop' } });
  await drop.session.start();
  drop.stt.events!.failed(new Error('closed'));
  for (let t = 0; t < 400; t += 20) drop.session.audio(pcm(20));
  for (let t = 0; t < 600; t += 20) drop.session.audio(pcm(20, 8000));
  for (let t = 0; t < 1200; t += 20) drop.session.audio(pcm(20));
  await waitFor(() => drop.runs.sends.length === 1, 'turn after the drop');
  assert.equal(drop.runs.sends[0].text, 'After the drop');
  drop.session.end('user');
}

/**
 * Regression (voice turn 5f4e2818-1): the vocabulary prompt made gpt-4o-transcribe ANSWER the
 * spoken "Tell me about padel rules in a few sentences." and the answer became the USER message.
 */
async function transcriptGuards(): Promise<void> {
  // Turn audio history: ms-addressed slices, old audio forgotten.
  const history = new PcmHistory();
  history.push(pcm(1000, 1000));
  history.push(pcm(500));
  assert.equal(history.totalMs, 1500);
  assert.equal(history.slice(900, 1200)?.length, 300 * 48);
  assert.equal(history.slice(1400, 9000)?.length, 100 * 48, 'clamped to what was appended');
  for (let i = 0; i < 40; i += 1) history.push(pcm(1000));
  assert.equal(history.slice(0, 1000), null, 'older than the kept window');
  assert.equal(history.slice(history.totalMs - 1000, history.totalMs)?.length, 1000 * 48);

  const question = 'Tell me about padel rules in a few sentences.';
  const answer =
    'The rules of padel are designed to allow for fair play and competitive matches. A standard padel match is played by two teams of two players each. ' +
    'The game is scored similarly to tennis, with points awarded for winning rallies.';
  const batchCalls: { prompt: string; bytes: number }[] = [];
  const h = harness({
    batch: {
      name: 'fake-batch',
      model: 'gpt-4o-mini-transcribe',
      transcribe: async ({ wav, prompt }) => {
        batchCalls.push({ prompt, bytes: wav.length });
        return question;
      },
    },
  });
  await h.session.start();
  const events = h.stt.events!;
  events.speechStarted();
  events.delta('q1', 'The rules of padel');
  events.speechStopped();
  events.completed('q1', answer, { ms: 4400, pcm: pcm(4400, 2000) });
  await waitFor(() => h.runs.sends.length === 1, 'send after the re-transcription');
  assert.equal(h.runs.sends[0].text, question, 'the stored USER message is the transcript, not the answer');
  assert.deepEqual(batchCalls.map((c) => c.prompt), [''], 're-transcribed once, without the prompt');
  assert.equal(batchCalls[0].bytes, 44 + 4400 * 48, 'the turn audio as WAV');
  const final = h.of('voice:caption').filter((e) => e.payload.final === true);
  assert.deepEqual(final.map((e) => e.payload.text), [question]);
  assert.ok(h.usage.some((u) => u.kind === 'batch_transcription' && u.amount === 4400), 're-transcription metered');
  h.session.end('user');

  // A plausible transcript is used as is (no second call); unknown audio length isn't judged.
  const ok = harness({ batch: { name: 'b', model: 'm', transcribe: async () => assert.fail('no re-transcription') } });
  await ok.session.start();
  ok.stt.events!.speechStarted();
  ok.stt.events!.speechStopped();
  ok.stt.events!.completed('q2', question, { ms: 4400, pcm: pcm(4400) });
  await waitFor(() => ok.runs.sends.length === 1, 'plausible send');
  assert.equal(ok.runs.sends[0].text, question);
  ok.session.end('user');

  // No fallback transcriber (or no audio kept): nothing is sent, back to listening.
  const none = harness();
  await none.session.start();
  none.stt.events!.speechStarted();
  none.stt.events!.speechStopped();
  none.stt.events!.completed('q3', answer, { ms: 4400, pcm: null });
  await waitFor(() => none.lastPhase() === 'listening', 'listening again');
  await sleep(20);
  assert.equal(none.runs.sends.length, 0, 'an answer never becomes the USER message');
  none.session.end('user');

  // Speaker echo while the reply plays: a short sound (no barge-in) whose words are the reply.
  const e = harness();
  await e.session.start();
  await speak(e, 'Tell me about my games');
  await waitFor(() => e.runs.followed.has('run-1'), 'follow');
  const reply = 'You have three games this week. The first one is on Monday evening at the club near your home.';
  e.runs.run('run-1').onEvent({ type: 'text.delta', text: `${reply} And the rest` });
  await waitFor(() => e.of('voice:speech-text').length === 2 && e.lastPhase() === 'speaking', 'speaking');
  const captions = e.of('voice:caption').length;
  e.stt.events!.speechStarted();
  await sleep(40);
  e.stt.events!.speechStopped();
  e.stt.events!.delta('echo-1', 'The first one is');
  assert.equal(e.of('voice:caption').length, captions, 'echo words are not shown as a caption');
  assert.equal(e.of('voice:stop-playback').length, 0, 'a caption of a short sound is no barge-in');
  e.stt.events!.completed('echo-1', 'The first one is on Monday evening');
  await sleep(30);
  assert.equal(e.runs.sends.length, 1, 'echo never sent as the user');
  assert.equal(e.lastPhase(), 'speaking', 'the reply keeps playing');
  assert.deepEqual(e.runs.cancels, []);
  assert.ok(e.logs.some((line) => line.includes('echo transcript dropped')));

  // Real words over the reply (even short ones) still interrupt it at the final transcript.
  e.stt.events!.speechStarted();
  await sleep(40);
  e.stt.events!.speechStopped();
  e.stt.events!.completed('u-1', 'Only Sunday ones');
  await waitFor(() => e.runs.sends.length === 2, 'new turn');
  assert.equal(e.runs.sends[1].text, 'Only Sunday ones');
  assert.equal(e.of('voice:stop-playback').length, 1);
  assert.deepEqual(e.runs.cancels, ['run-1']);
  e.session.end('user');
}

void (async () => {
  let exitCode = 0;
  try {
    pureCases();
    await startLimit();
    await turnAndOrderedSpeech();
    await fillerAndFailures();
    await spokenNarrationCoversTheWait();
    await confirmFlow();
    await bargeIn();
    await continuationBusyBudgetIdle();
    await gapFillOnlyMidSpeech();
    await suspendAndResume();
    await batchFallback();
    await transcriptGuards();
    console.log('agentVoiceRealtime.test: ok');
  } catch (error) {
    console.error(error);
    exitCode = 1;
  } finally {
    process.exit(exitCode);
  }
})();
