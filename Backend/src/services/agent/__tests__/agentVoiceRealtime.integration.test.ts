/**
 * Agent voice v2 over the real `/agent-voice` namespace (docs/domains/agent.md § Voice), real dev
 * DB and run service with a scripted LLM, fake transcription / speech providers:
 * - handshake auth (no / bad token), `voice:start` ack errors: BAD_REQUEST, NOT_FOUND (someone
 *   else's chat), VOICE_V2_UNAVAILABLE (flag off / no provider), BUDGET_EXCEEDED with retryAt;
 * - a spoken turn → stored USER message + `AgentRun.voice = true` → reply audio as binary
 *   `voice:audio-out` frames in order → `voice:audio-end` → listening after playback `done`;
 * - usage rows `agent_voice_realtime_transcription` (20 per started second sent) and
 *   `agent_voice_speech` (1 per spoken char), no transcript / text in them;
 * - barge-in: the run is cancelled and the stored reply cut to what was heard (+ "…");
 * - a second session of the same user ends the first (`reason: 'replaced'`).
 *
 * Stop the backend dev server first: its queue worker would claim these runs.
 */
import '../../../routes/__tests__/agentRoutesTestEnv';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { AgentMessageRole, AgentRunStatus } from '@prisma/client';
import { Server as SocketIOServer } from 'socket.io';
import { WebSocket } from 'undici';
import { AGENT_VOICE_NAMESPACE } from '@bandeja/shared/agentVoiceRealtime';
import prisma from '../../../config/database';
import { resolveAgentEnvConfig } from '../../../config/agentEnv';
import { generateShortAccessToken } from '../../../utils/jwt';
import { LLM_REASON } from '../../ai/llmReasons';
import { createAgentPermissionFixture } from '../access/__tests__/agentPermissionMatrix';
import { createAgentChat } from '../agentChat.service';
import { InMemoryAgentEventStore } from '../agentEvents';
import { AGENT_VOICE_USAGE_REASONS } from '../agentGuards';
import { createAgentRunService } from '../agentRun.service';
import type { AgentLlmClient, AgentLlmStreamChunk, AgentLlmStreamParams } from '../llm/deepseekStream';
import { AGENT_TOOL_DEFINITIONS } from '../tools';
import { AgentToolRegistry } from '../tools/registry';
import { registerAgentVoiceNamespace } from '../voice/realtime/agentVoiceNamespace';
import {
  setAgentVoiceRealtimeProvidersForTests,
  type AgentVoiceSttEvents,
  type AgentVoiceSttOptions,
} from '../voice/realtime/agentVoiceRealtimeProviders';
import { setAgentVoiceRunServiceForTests } from '../voice/realtime/agentVoiceRuns';

type Json = Record<string, unknown>;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(check: () => boolean, label: string, timeoutMs = 8000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for: ${label}`);
    await sleep(10);
  }
}

/**
 * Just enough of the Socket.IO v4 wire protocol (Engine.IO 4, websocket transport) for one
 * namespace: connect with auth, emit (with ack, with one binary attachment), receive events
 * (binary attachments resolved), answer pings.
 */
class MiniSocketClient {
  readonly events: { event: string; payload: Json }[] = [];
  connectError: string | null = null;
  connected = false;
  private ws!: WebSocket;
  private ackSeq = 0;
  private readonly acks = new Map<number, (value: unknown) => void>();
  private pendingBinary: { packet: unknown[]; left: number; buffers: Buffer[] } | null = null;

  constructor(
    private readonly url: string,
    private readonly nsp: string,
  ) {}

  async connect(auth: Json): Promise<void> {
    this.ws = new WebSocket(`${this.url}/socket.io/?EIO=4&transport=websocket`);
    this.ws.binaryType = 'arraybuffer';
    this.ws.addEventListener('message', (message) => this.onMessage(message.data as string | ArrayBuffer));
    await new Promise<void>((resolve, reject) => {
      this.ws.addEventListener('open', () => resolve());
      this.ws.addEventListener('error', () => reject(new Error('ws error')));
    });
    await waitFor(() => this.opened, 'engine.io open');
    this.ws.send(`40${this.nsp},${JSON.stringify(auth)}`);
    await waitFor(() => this.connected || this.connectError != null, 'namespace connect');
  }

  private opened = false;

  private onMessage(data: string | ArrayBuffer): void {
    if (typeof data !== 'string') {
      const pending = this.pendingBinary;
      if (!pending) return;
      pending.buffers.push(Buffer.from(data));
      if (--pending.left === 0) {
        this.pendingBinary = null;
        this.deliver(this.resolvePlaceholders(pending.packet, pending.buffers) as unknown[]);
      }
      return;
    }
    if (data[0] === '0') this.opened = true;
    else if (data === '2') this.ws.send('3');
    else if (data[0] === '4') this.onPacket(data.slice(1));
  }

  private onPacket(raw: string): void {
    const type = raw[0];
    let rest = raw.slice(1);
    let attachments = 0;
    if (type === '5' || type === '6') {
      const dash = rest.indexOf('-');
      attachments = Number(rest.slice(0, dash));
      rest = rest.slice(dash + 1);
    }
    if (rest.startsWith(this.nsp)) rest = rest.slice(this.nsp.length + 1);
    const idMatch = /^\d+/.exec(rest);
    const id = idMatch ? Number(idMatch[0]) : null;
    if (idMatch) rest = rest.slice(idMatch[0].length);
    const body = rest ? JSON.parse(rest) : null;
    if (type === '0') this.connected = true;
    else if (type === '4') this.connectError = String((body as Json)?.message ?? 'error');
    else if (type === '3' && id != null) this.acks.get(id)?.((body as unknown[])[0]);
    else if (type === '2') this.deliver(body as unknown[]);
    else if (type === '5') this.pendingBinary = { packet: body as unknown[], left: attachments, buffers: [] };
  }

  private resolvePlaceholders(value: unknown, buffers: Buffer[]): unknown {
    if (Array.isArray(value)) return value.map((v) => this.resolvePlaceholders(v, buffers));
    if (value && typeof value === 'object') {
      const obj = value as Json;
      if (obj._placeholder === true && typeof obj.num === 'number') return buffers[obj.num];
      return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, this.resolvePlaceholders(v, buffers)]));
    }
    return value;
  }

  private deliver(packet: unknown[]): void {
    this.events.push({ event: String(packet[0]), payload: (packet[1] ?? {}) as Json });
  }

  emit(event: string, payload: unknown): void {
    this.ws.send(`42${this.nsp},${JSON.stringify([event, payload])}`);
  }

  emitBinary(event: string, data: Buffer): void {
    this.ws.send(`451-${this.nsp},${JSON.stringify([event, { _placeholder: true, num: 0 }])}`);
    this.ws.send(data);
  }

  request(event: string, payload: unknown): Promise<Json> {
    const id = this.ackSeq++;
    return new Promise((resolve) => {
      this.acks.set(id, (value) => resolve(value as Json));
      this.ws.send(`42${this.nsp},${id}${JSON.stringify([event, payload])}`);
    });
  }

  of(event: string): Json[] {
    return this.events.filter((e) => e.event === event).map((e) => e.payload);
  }

  phases(): unknown[] {
    return this.of('voice:state').map((p) => p.phase);
  }

  close(): void {
    try {
      this.ws.close();
    } catch {
      // closed
    }
  }
}

class FakeStt {
  readonly name = 'fake';
  events: AgentVoiceSttEvents | null = null;
  options: AgentVoiceSttOptions | null = null;
  appended = 0;
  private unbilled = 0;
  async open(options: AgentVoiceSttOptions, events: AgentVoiceSttEvents) {
    this.options = options;
    this.events = events;
    return {
      kind: 'realtime' as const,
      model: options.model,
      provider: 'fake',
      append: (pcm: Buffer) => {
        this.appended += pcm.length;
        this.unbilled += pcm.length;
      },
      clear: () => {},
      takeBilledMs: () => {
        const ms = this.unbilled / 48;
        this.unbilled = 0;
        return ms;
      },
      close: () => {},
    };
  }
}

/** 10 ms of audio per character, tagged with the text. */
function fakeSpeech(text: string): Buffer {
  const buf = Buffer.alloc(text.length * 480);
  for (let i = 0; i < buf.length; i++) buf[i] = text.charCodeAt(i % text.length) & 0xff;
  return buf;
}

const fakeTts = {
  name: 'fake-tts',
  async *stream(input: { text: string; signal: AbortSignal }): AsyncIterable<Buffer> {
    const audio = fakeSpeech(input.text);
    for (let at = 0; at < audio.length; at += 3000) {
      if (input.signal.aborted) return;
      await sleep(1);
      yield audio.subarray(at, Math.min(audio.length, at + 3000));
    }
  },
};

/** Scripted replies: a list of text pieces per run; `hang` keeps the stream open until aborted. */
class ScriptedLlm implements AgentLlmClient {
  readonly provider = 'test';
  readonly model = 'scripted';
  readonly scripts: { pieces: string[]; gapMs: number; hang: boolean }[] = [];
  readonly voiceRuleSeen: boolean[] = [];
  stream(params: AgentLlmStreamParams): AsyncIterable<AgentLlmStreamChunk> {
    const script = this.scripts.shift() ?? { pieces: ['OK.'], gapMs: 0, hang: false };
    this.voiceRuleSeen.push(params.messages.some((m) => m.role === 'system' && typeof m.content === 'string' && m.content.includes('Voice conversation')));
    return (async function* () {
      for (const piece of script.pieces) {
        if (params.signal.aborted) return;
        yield { type: 'text', text: piece } as AgentLlmStreamChunk;
        await sleep(script.gapMs);
      }
      while (script.hang && !params.signal.aborted) await sleep(20);
      yield { type: 'usage', inputTokens: 10, outputTokens: 5 } as AgentLlmStreamChunk;
      yield { type: 'finish', reason: 'stop' } as AgentLlmStreamChunk;
    })();
  }
}

void (async () => {
  let exitCode = 0;
  const fixture = await createAgentPermissionFixture();
  const { owner, stranger } = fixture.principals;
  const userIds = [owner.userId, stranger.userId];
  const chatIds: string[] = [];
  const clients: MiniSocketClient[] = [];
  const httpServer = http.createServer();
  const io = new SocketIOServer(httpServer, { path: '/socket.io/', transports: ['websocket'] });
  registerAgentVoiceNamespace(io);
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const { port } = httpServer.address() as AddressInfo;
  const url = `ws://127.0.0.1:${port}`;
  const token = (userId: string) => generateShortAccessToken({ userId });
  const savedBudget = process.env.AGENT_DAILY_TOKEN_BUDGET;
  const clearUsage = () => prisma.llmUsageLog.deleteMany({ where: { userId: { in: userIds }, reason: { in: AGENT_VOICE_USAGE_REASONS } } });

  const llm = new ScriptedLlm();
  const service = createAgentRunService({
    llm: () => llm,
    events: new InMemoryAgentEventStore(),
    registry: new AgentToolRegistry(AGENT_TOOL_DEFINITIONS),
    config: () => resolveAgentEnvConfig({}),
    logUsage: async () => {},
    wake: async () => {},
  });
  const stt = new FakeStt();
  const providers = { stt, tts: fakeTts, batch: null };

  const client = async (userId: string | null, auth?: Json) => {
    const c = new MiniSocketClient(url, AGENT_VOICE_NAMESPACE);
    clients.push(c);
    await c.connect(auth ?? (userId ? { token: token(userId) } : {}));
    return c;
  };

  try {
    await clearUsage();
    await service.start();
    setAgentVoiceRunServiceForTests(service);
    setAgentVoiceRealtimeProvidersForTests(providers);
    const chat = await createAgentChat(owner.userId);
    const strangerChat = await createAgentChat(stranger.userId);
    chatIds.push(chat.id, strangerChat.id);
    const start = { chatId: chat.id, locale: 'en', inputSampleRate: 24_000 };

    // --- handshake ------------------------------------------------------------------------------
    assert.match((await client(null)).connectError ?? '', /No token/);
    assert.match((await client(null, { token: 'not-a-jwt' })).connectError ?? '', /Invalid token/);

    // --- start errors ---------------------------------------------------------------------------
    const c1 = await client(owner.userId);
    assert.ok(c1.connected);
    assert.equal((await c1.request('voice:start', { chatId: chat.id, inputSampleRate: 16_000 })).code, 'BAD_REQUEST');
    assert.equal((await c1.request('voice:start', { ...start, chatId: strangerChat.id })).code, 'NOT_FOUND', "someone else's chat");
    setAgentVoiceRealtimeProvidersForTests(null);
    assert.equal((await c1.request('voice:start', start)).code, 'VOICE_V2_UNAVAILABLE', 'no provider');
    setAgentVoiceRealtimeProvidersForTests(providers);
    process.env.AGENT_VOICE_REALTIME_ENABLED = 'false';
    assert.equal((await c1.request('voice:start', start)).code, 'VOICE_V2_UNAVAILABLE', 'flag off');
    delete process.env.AGENT_VOICE_REALTIME_ENABLED;
    process.env.AGENT_DAILY_TOKEN_BUDGET = '0';
    const over = await c1.request('voice:start', start);
    assert.equal(over.code, 'BUDGET_EXCEEDED');
    assert.ok(typeof over.retryAt === 'string' && !Number.isNaN(Date.parse(over.retryAt as string)));
    if (savedBudget === undefined) delete process.env.AGENT_DAILY_TOKEN_BUDGET;
    else process.env.AGENT_DAILY_TOKEN_BUDGET = savedBudget;

    // --- a spoken turn -------------------------------------------------------------------------
    const ack = await c1.request('voice:start', start);
    assert.equal(ack.ok, true, JSON.stringify(ack));
    assert.equal(ack.outputSampleRate, 24_000);
    assert.equal(ack.maxSessionMs, 30 * 60 * 1000);
    await waitFor(() => c1.phases().includes('listening') && stt.events != null, 'listening');
    assert.equal(stt.options?.model, 'gpt-4o-transcribe');

    // 1.5 s of mic audio in 20 ms frames (binary).
    for (let i = 0; i < 75; i++) c1.emitBinary('voice:audio', Buffer.alloc(960, 1));
    await waitFor(() => stt.appended === 75 * 960, 'audio reached the transcriber');
    const reply = 'Two games tomorrow. The best one is at seven at the club, on court two with Ana.';
    llm.scripts.push({ pieces: ['Two games tomorrow. ', 'The best one is at seven at the club, ', 'on court two with Ana.'], gapMs: 20, hang: false });
    stt.events!.speechStarted();
    stt.events!.delta('i1', 'Any games');
    stt.events!.speechStopped();
    stt.events!.completed('i1', 'Any games tomorrow?');
    await waitFor(() => c1.of('voice:turn').length === 1, 'voice:turn');
    const turn = c1.of('voice:turn')[0];
    assert.equal(turn.transcript, 'Any games tomorrow?');
    await waitFor(() => c1.of('voice:audio-end').length === 1, 'audio-end');

    const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: turn.runId as string } });
    assert.equal(run.voice, true, 'voice run');
    assert.equal(run.chatId, chat.id);
    assert.equal(run.status, AgentRunStatus.COMPLETED);
    assert.equal(llm.voiceRuleSeen.at(-1), true, 'voice rule in the prompt');
    const userMessage = await prisma.agentMessage.findFirstOrThrow({ where: { runId: run.id, role: AgentMessageRole.USER } });
    assert.deepEqual(userMessage.content, [{ type: 'text', text: 'Any games tomorrow?' }]);

    const frames = c1.of('voice:audio-out');
    assert.deepEqual(frames.map((f) => f.seq), frames.map((_, i) => i), 'audio seq in order');
    assert.ok(frames.every((f) => f.turnId === turn.turnId && Buffer.isBuffer(f.pcm)));
    const spoken = c1.of('voice:speech-text').map((p) => p.text as string);
    assert.equal(spoken.join(' '), reply);
    assert.ok(Buffer.concat(frames.map((f) => f.pcm as Buffer)).equals(Buffer.concat(spoken.map(fakeSpeech))), 'audio bytes in sentence order');
    assert.ok(c1.of('voice:timing').length === 1);

    c1.emit('voice:timing', { turnId: turn.turnId, marks: { playbackStart: Date.now() } });
    c1.emit('voice:playback', { turnId: turn.turnId, playedMs: 99_999, done: true });
    await waitFor(() => c1.phases().at(-1) === 'listening', 'listening after playback');

    // Usage: realtime transcription (1.5 s → 2 started seconds × 20) and speech (1 per char).
    await sleep(100);
    const sttRows = await prisma.llmUsageLog.findMany({ where: { userId: owner.userId, reason: LLM_REASON.AGENT_VOICE_REALTIME_TRANSCRIPTION } });
    assert.equal(sttRows.length, 1);
    assert.equal(sttRows[0].inputTokens, 40);
    assert.equal(sttRows[0].model, 'gpt-4o-transcribe');
    const speechRows = await prisma.llmUsageLog.findMany({ where: { userId: owner.userId, reason: LLM_REASON.AGENT_VOICE_SPEECH } });
    assert.equal(speechRows.reduce((sum, row) => sum + (row.inputTokens ?? 0), 0), spoken.join('').length);
    for (const row of [...sttRows, ...speechRows]) {
      assert.ok(!row.input.includes('games') && !row.output.includes('games') && !row.input.includes('court'), 'no transcript / spoken text stored');
    }

    // --- barge-in: cancel + cut the stored reply to what was heard ------------------------------
    const first = 'First part is here.';
    // Voice runs skip the narration hold: the text streams while the model still writes.
    llm.scripts.push({ pieces: [`${first}\n`, 'And the second part of this answer is quite a lot longer than the first. '], gapMs: 30, hang: true });
    stt.events!.speechStarted();
    stt.events!.delta('i2', 'And');
    stt.events!.speechStopped();
    stt.events!.completed('i2', 'And on Sunday?');
    await waitFor(() => c1.of('voice:turn').length === 2, 'second turn');
    const turn2 = c1.of('voice:turn')[1];
    await waitFor(() => c1.of('voice:speech-text').filter((p) => p.turnId === turn2.turnId).length === 2, 'both sentences queued');
    await waitFor(() => c1.of('voice:audio-out').filter((p) => p.turnId === turn2.turnId).length >= 4, 'speaking');
    // The user heard exactly the first sentence, then talked.
    c1.emit('voice:playback', { turnId: turn2.turnId, playedMs: first.length * 10, done: false });
    await sleep(50);
    stt.events!.speechStarted();
    stt.events!.delta('i3', 'Stop');
    await waitFor(() => c1.of('voice:stop-playback').length === 1, 'stop-playback');
    assert.equal(c1.of('voice:stop-playback')[0].turnId, turn2.turnId);
    const run2 = await service.waitForRun(turn2.runId as string);
    assert.equal(run2.status, AgentRunStatus.CANCELLED);
    await sleep(300);
    const replies = await prisma.agentMessage.findMany({ where: { runId: run2.id, role: AgentMessageRole.ASSISTANT } });
    assert.equal(replies.length, 1);
    const cutText = (replies[0].content as { text: string }[])[0].text;
    assert.equal(cutText, `${first} …`);
    assert.deepEqual(replies[0].llmMessages, [{ role: 'assistant', content: `${first} …` }]);
    stt.events!.speechStopped();
    stt.events!.completed('i3', '');
    await waitFor(() => c1.phases().at(-1) === 'listening', 'listening again');

    // --- one session per user ------------------------------------------------------------------
    const c2 = await client(owner.userId);
    assert.equal((await c2.request('voice:start', start)).ok, true);
    await waitFor(() => c1.of('voice:state').some((p) => p.phase === 'ended' && p.reason === 'replaced'), 'replaced');
    c2.emit('voice:end', {});
    await waitFor(() => c2.of('voice:state').some((p) => p.phase === 'ended' && p.reason === 'user'), 'ended by the user');

    console.log('agentVoiceRealtime.integration: ok');
  } catch (error) {
    console.error(error);
    exitCode = 1;
  } finally {
    if (savedBudget === undefined) delete process.env.AGENT_DAILY_TOKEN_BUDGET;
    else process.env.AGENT_DAILY_TOKEN_BUDGET = savedBudget;
    delete process.env.AGENT_VOICE_REALTIME_ENABLED;
    setAgentVoiceRealtimeProvidersForTests(undefined);
    setAgentVoiceRunServiceForTests(null);
    for (const c of clients) c.close();
    service.stop();
    io.close();
    httpServer.close();
    await clearUsage().catch((e) => console.error(e));
    await prisma.agentChat.deleteMany({ where: { id: { in: chatIds } } }).catch((e) => console.error(e));
    await fixture.cleanup().catch((e) => console.error(e));
    await prisma.$disconnect();
    process.exit(exitCode);
  }
})();
