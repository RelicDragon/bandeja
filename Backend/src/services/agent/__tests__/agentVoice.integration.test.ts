/**
 * Agent voice (docs/domains/agent.md § Voice), real dev DB, no real provider or model:
 * - pure helpers: transcript cleanup (silence hallucinations), speech text guard, charges,
 *   vocabulary prompt, file extensions;
 * - `/api/agent/voice/*` over HTTP with a stub provider: auth, formats, size, duration from the
 *   container, budget rows (charge, no transcript / spoken text stored), budget exceeded,
 *   provider missing / failing → 503 VOICE_UNAVAILABLE, speech bytes + headers;
 * - `voice: true` on POST /messages passes validation; a voice run stores `voice`, its prompt
 *   carries `AGENT_VOICE_RULE` (a typed run's doesn't), and a confirm follow-up inherits it.
 */
import '../../../routes/__tests__/agentRoutesTestEnv';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { AgentRunStatus } from '@prisma/client';
import { AGENT_VOICE_MAX_AUDIO_MS, AGENT_VOICE_SPEECH_MAX_CHARS } from '@bandeja/shared/agentContract';
import app from '../../../app';
import prisma from '../../../config/database';
import { resolveAgentEnvConfig } from '../../../config/agentEnv';
import { generateShortAccessToken } from '../../../utils/jwt';
import { LLM_REASON } from '../../ai/llmReasons';
import { createAgentPermissionFixture } from '../access/__tests__/agentPermissionMatrix';
import { createAgentChat } from '../agentChat.service';
import { AGENT_VOICE_RULE } from '../agentContext.service';
import { InMemoryAgentEventStore } from '../agentEvents';
import { AGENT_VOICE_USAGE_REASONS } from '../agentGuards';
import { createAgentRunService } from '../agentRun.service';
import type { AgentLlmClient, AgentLlmStreamChunk, AgentLlmStreamParams } from '../llm/deepseekStream';
import { AGENT_TOOL_DEFINITIONS } from '../tools';
import { AgentToolRegistry } from '../tools/registry';
import { setAgentVoiceProviderForTests, type AgentVoiceProvider } from '../voice/agentVoice.service';
import {
  agentVoiceChargeDurationMs,
  agentVoiceFileExtension,
  agentVoiceSpeechCharge,
  agentVoiceTranscriptionCharge,
  buildAgentVoiceVocabulary,
  cleanAgentVoiceTranscript,
  normalizeAgentSpeechText,
} from '../voice/agentVoiceText';

type Json = Record<string, unknown>;

/** 16 kHz mono PCM16 WAV of `ms` milliseconds (a quiet tone, so it isn't all zeros). */
function wav(ms: number): Buffer {
  const rate = 16_000;
  const samples = Math.round((rate * ms) / 1000);
  const buf = Buffer.alloc(44 + samples * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) buf.writeInt16LE(Math.round(Math.sin(i / 8) * 2000), 44 + i * 2);
  return buf;
}

class StubVoice implements AgentVoiceProvider {
  readonly name = 'stub';
  transcript = 'Find me a game tomorrow evening';
  fail = false;
  readonly transcribeCalls: { mimeType: string; filename: string; prompt: string; model: string; bytes: number }[] = [];
  readonly speakCalls: { text: string; model: string; voice: string }[] = [];
  async transcribe(input: Parameters<AgentVoiceProvider['transcribe']>[0]) {
    if (this.fail) throw Object.assign(new Error('upstream down'), { status: 500 });
    this.transcribeCalls.push({ mimeType: input.mimeType, filename: input.filename, prompt: input.prompt, model: input.model, bytes: input.audio.length });
    return this.transcript;
  }
  async speak(input: Parameters<AgentVoiceProvider['speak']>[0]) {
    if (this.fail) throw new Error('upstream down');
    this.speakCalls.push({ text: input.text, model: input.model, voice: input.voice });
    return Buffer.from(`ID3-fake-mp3:${input.text}`);
  }
}

class CapturingLlm implements AgentLlmClient {
  readonly provider = 'test';
  readonly model = 'scripted';
  readonly systemPrompts: string[] = [];
  stream(params: AgentLlmStreamParams): AsyncIterable<AgentLlmStreamChunk> {
    // Static rules + the per-turn snapshot (voice rule lives there, `withAgentSnapshot`).
    const system = params.messages.filter((m) => m.role === 'system').map((m) => (typeof m.content === 'string' ? m.content : ''));
    this.systemPrompts.push(system.join('\n'));
    return (async function* () {
      yield { type: 'text', text: 'Two games tomorrow. The best is at seven.' } as AgentLlmStreamChunk;
      yield { type: 'usage', inputTokens: 10, outputTokens: 5 } as AgentLlmStreamChunk;
      yield { type: 'finish', reason: 'stop' } as AgentLlmStreamChunk;
    })();
  }
}

function pureCases(): void {
  // Transcript cleanup: silence hallucinations are "no speech"; real text is kept, trimmed.
  assert.equal(cleanAgentVoiceTranscript('  Find me a game  '), 'Find me a game');
  assert.equal(cleanAgentVoiceTranscript(''), '');
  assert.equal(cleanAgentVoiceTranscript('...'), '');
  assert.equal(cleanAgentVoiceTranscript('Thank you for watching!'), '');
  assert.equal(cleanAgentVoiceTranscript('Subtitles by the Amara.org community'), '');
  assert.equal(cleanAgentVoiceTranscript('Продолжение следует...'), '');
  assert.equal(cleanAgentVoiceTranscript('Субтитры сделал DimaTorzok'), '');
  assert.equal(cleanAgentVoiceTranscript('You'), '');
  assert.equal(cleanAgentVoiceTranscript('Bye'), 'Bye', 'a real one-word goodbye stays');
  assert.equal(cleanAgentVoiceTranscript('Thank you for the game'), 'Thank you for the game');
  assert.equal(cleanAgentVoiceTranscript('Найди игру на завтра'), 'Найди игру на завтра');

  // Speech text guard.
  assert.equal(normalizeAgentSpeechText(' a\n\nb\u0007 c '), 'a b c');
  assert.equal(normalizeAgentSpeechText('x'.repeat(AGENT_VOICE_SPEECH_MAX_CHARS + 50)).length, AGENT_VOICE_SPEECH_MAX_CHARS);

  // Charges: parsed duration wins, then the client's, then a 32 kbit/s estimate; 1 s floor, cap.
  assert.equal(agentVoiceChargeDurationMs({ parsedMs: 2500, clientMs: 9000, bytes: 1 }), 2500);
  assert.equal(agentVoiceChargeDurationMs({ parsedMs: null, clientMs: 4200, bytes: 1 }), 4200);
  assert.equal(agentVoiceChargeDurationMs({ parsedMs: null, clientMs: null, bytes: 40_000 }), 10_000);
  assert.equal(agentVoiceChargeDurationMs({ parsedMs: 10, clientMs: null, bytes: 1 }), 1000);
  assert.equal(agentVoiceChargeDurationMs({ parsedMs: null, clientMs: 10 * AGENT_VOICE_MAX_AUDIO_MS, bytes: 1 }), AGENT_VOICE_MAX_AUDIO_MS);
  assert.equal(agentVoiceTranscriptionCharge(1500, 20), 40);
  assert.equal(agentVoiceSpeechCharge('hello', 2), 10);

  // Vocabulary: names only, deduped, capped.
  assert.equal(buildAgentVoiceVocabulary({ firstName: 'Ilya', clubNames: ['Padel Arena', 'padel arena', ' X  Club '] }), 'Bandeja, padel, pickleball, Ilya, Padel Arena, X Club');
  assert.ok(buildAgentVoiceVocabulary({ firstName: null, clubNames: Array.from({ length: 200 }, (_, i) => `Club number ${i}`) }).length <= 700);

  assert.equal(agentVoiceFileExtension('audio/webm;codecs=opus'), 'webm');
  assert.equal(agentVoiceFileExtension('audio/mp4'), 'mp4');
  assert.equal(agentVoiceFileExtension('audio/wav'), 'wav');
  assert.equal(agentVoiceFileExtension('video/webm'), null);
  assert.equal(agentVoiceFileExtension('application/json'), null);
}

void (async () => {
  let exitCode = 0;
  pureCases();
  const stub = new StubVoice();
  setAgentVoiceProviderForTests(stub);
  const fixture = await createAgentPermissionFixture();
  const { owner, stranger } = fixture.principals;
  const userIds = [owner.userId, stranger.userId];
  const chatIds: string[] = [];
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}/api/agent`;
  const auth = (userId: string) => ({ Authorization: `Bearer ${generateShortAccessToken({ userId })}` });
  const savedBudget = process.env.AGENT_DAILY_TOKEN_BUDGET;
  const clearUsage = () => prisma.llmUsageLog.deleteMany({ where: { userId: { in: userIds }, reason: { in: AGENT_VOICE_USAGE_REASONS } } });

  const transcribe = async (userId: string | null, body: Buffer, contentType: string, query = '') => {
    const res = await fetch(`${base}/voice/transcriptions${query}`, {
      method: 'POST',
      headers: { ...(userId ? auth(userId) : {}), 'Content-Type': contentType },
      body: new Uint8Array(body),
    });
    const text = await res.text();
    return { status: res.status, body: (text ? JSON.parse(text) : {}) as Json };
  };
  const speak = async (userId: string, payload: unknown) =>
    fetch(`${base}/voice/speech`, {
      method: 'POST',
      headers: { ...auth(userId), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

  try {
    await prisma.user.updateMany({ where: { id: { in: userIds } }, data: { lastUserIP: '::ffff:127.0.0.1' } });
    await clearUsage();

    // --- transcription -----------------------------------------------------------------------
    assert.equal((await transcribe(null, wav(1500), 'audio/wav')).status, 401);

    let res = await transcribe(owner.userId, wav(1500), 'audio/wav', '?durationMs=9000');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.data, { text: 'Find me a game tomorrow evening', durationMs: 1500 }, 'container duration wins over the client value');
    assert.equal(stub.transcribeCalls.at(-1)?.filename, 'speech.wav');
    assert.equal(stub.transcribeCalls.at(-1)?.mimeType, 'audio/wav');
    assert.equal(stub.transcribeCalls.at(-1)?.model, 'gpt-4o-mini-transcribe');
    assert.ok(stub.transcribeCalls.at(-1)?.prompt.startsWith('Bandeja, padel'), 'vocabulary prompt sent');

    const sttRows = await prisma.llmUsageLog.findMany({ where: { userId: owner.userId, reason: LLM_REASON.AGENT_VOICE_TRANSCRIPTION } });
    assert.equal(sttRows.length, 1);
    assert.equal(sttRows[0].inputTokens, 40, '2 started seconds × 20');
    assert.ok(!sttRows[0].output.includes('tomorrow') && !sttRows[0].input.includes('tomorrow'), 'no transcript stored');

    // WebM without a duration: the client's measure is charged.
    stub.transcript = 'Thanks for watching!';
    res = await transcribe(owner.userId, Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(3000, 1)]), 'audio/webm;codecs=opus', '?durationMs=3200');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.data, { text: '', durationMs: 3200 }, 'silence hallucination → empty transcript');
    assert.equal(stub.transcribeCalls.at(-1)?.filename, 'speech.webm');
    stub.transcript = 'Find me a game tomorrow evening';

    res = await transcribe(owner.userId, wav(1500), 'video/webm');
    assert.equal(res.status, 400, 'non-audio content type never reaches the service as audio');
    res = await transcribe(owner.userId, Buffer.alloc(5000, 1), 'audio/flac');
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'VOICE_AUDIO_INVALID');
    res = await transcribe(owner.userId, Buffer.alloc(200, 1), 'audio/webm');
    assert.equal(res.body.code, 'VOICE_AUDIO_INVALID', 'too short to hold a word');
    res = await transcribe(owner.userId, wav(AGENT_VOICE_MAX_AUDIO_MS + 5000), 'audio/wav');
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'VOICE_AUDIO_INVALID', 'longer than the cap');
    res = await transcribe(owner.userId, wav(1500), 'audio/wav', '?durationMs=-5');
    assert.equal(res.status, 400, 'bad duration query');

    // --- speech --------------------------------------------------------------------------------
    let speech = await speak(owner.userId, { text: '  Two games tomorrow.\n The best is at seven. ' });
    assert.equal(speech.status, 200);
    assert.equal(speech.headers.get('content-type'), 'audio/mpeg');
    assert.equal(speech.headers.get('cache-control'), 'no-store');
    assert.equal(Buffer.from(await speech.arrayBuffer()).toString(), 'ID3-fake-mp3:Two games tomorrow. The best is at seven.');
    assert.deepEqual(stub.speakCalls.at(-1), { text: 'Two games tomorrow. The best is at seven.', model: 'gpt-4o-mini-tts', voice: 'coral' });
    const ttsRows = await prisma.llmUsageLog.findMany({ where: { userId: owner.userId, reason: LLM_REASON.AGENT_VOICE_SPEECH } });
    assert.equal(ttsRows.length, 1);
    assert.equal(ttsRows[0].inputTokens, 'Two games tomorrow. The best is at seven.'.length);
    assert.ok(!ttsRows[0].input.includes('seven'), 'spoken text not stored');

    assert.equal((await speak(owner.userId, { text: '   ' })).status, 400);
    assert.equal((await speak(owner.userId, { text: 'x'.repeat(AGENT_VOICE_SPEECH_MAX_CHARS + 1) })).status, 400);
    assert.equal((await speak(owner.userId, { text: 'hi', extra: 1 })).status, 400, 'strict body');

    // --- budget: voice charges count; over budget → 429 before the provider is called ---------
    process.env.AGENT_DAILY_TOKEN_BUDGET = '50';
    const callsBefore = stub.speakCalls.length;
    speech = await speak(owner.userId, { text: 'Over budget' });
    assert.equal(speech.status, 429);
    assert.equal(((await speech.json()) as Json).code, 'BUDGET_EXCEEDED');
    assert.equal(stub.speakCalls.length, callsBefore, 'provider not called');
    res = await transcribe(owner.userId, wav(1500), 'audio/wav');
    assert.equal(res.body.code, 'BUDGET_EXCEEDED');
    assert.equal((await speak(stranger.userId, { text: 'Someone else has budget' })).status, 200, 'budget is per user');
    if (savedBudget === undefined) delete process.env.AGENT_DAILY_TOKEN_BUDGET;
    else process.env.AGENT_DAILY_TOKEN_BUDGET = savedBudget;

    // --- provider failing / missing / switched off → 503 VOICE_UNAVAILABLE -----------------------
    stub.fail = true;
    res = await transcribe(stranger.userId, wav(1500), 'audio/wav');
    assert.equal(res.status, 503);
    assert.equal(res.body.code, 'VOICE_UNAVAILABLE');
    assert.equal((await speak(stranger.userId, { text: 'hi' })).status, 503);
    stub.fail = false;
    setAgentVoiceProviderForTests(null);
    res = await transcribe(stranger.userId, wav(1500), 'audio/wav');
    assert.equal(res.body.code, 'VOICE_UNAVAILABLE');
    setAgentVoiceProviderForTests(stub);
    process.env.AGENT_VOICE_ENABLED = 'false';
    res = await transcribe(stranger.userId, wav(1500), 'audio/wav');
    assert.equal(res.body.code, 'VOICE_UNAVAILABLE', 'kill switch');
    delete process.env.AGENT_VOICE_ENABLED;

    // --- POST /messages accepts `voice` (the test env has no LLM: 503 after validation) ---------
    const httpChat = await createAgentChat(owner.userId);
    chatIds.push(httpChat.id);
    const post = await fetch(`${base}/chats/${httpChat.id}/messages`, {
      method: 'POST',
      headers: { ...auth(owner.userId), 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'hi', voice: true }),
    });
    assert.equal(post.status, 503, 'voice passes validation');
    const badPost = await fetch(`${base}/chats/${httpChat.id}/messages`, {
      method: 'POST',
      headers: { ...auth(owner.userId), 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'hi', voice: 'yes' }),
    });
    assert.equal(badPost.status, 400);

    // --- voice runs: stored flag, prompt rule, follow-up inherits --------------------------------
    const llm = new CapturingLlm();
    const service = createAgentRunService({
      llm: () => llm,
      events: new InMemoryAgentEventStore(),
      registry: new AgentToolRegistry(AGENT_TOOL_DEFINITIONS),
      config: () => resolveAgentEnvConfig({}),
      logUsage: async () => {},
      wake: async () => {},
    });
    const chat = await createAgentChat(owner.userId);
    chatIds.push(chat.id);
    const voiceTurn = await service.enqueueRun({ userId: owner.userId, chatId: chat.id, text: 'Any games tomorrow?', voice: true });
    const voiceRun = await service.waitForRun(voiceTurn.runId);
    assert.equal(voiceRun.status, AgentRunStatus.COMPLETED);
    assert.equal(voiceRun.voice, true);
    assert.ok(llm.systemPrompts.at(-1)?.includes(AGENT_VOICE_RULE), 'voice rule in the prompt');

    const typedTurn = await service.enqueueRun({ userId: owner.userId, chatId: chat.id, text: 'And on Sunday?' });
    const typedRun = await service.waitForRun(typedTurn.runId);
    assert.equal(typedRun.voice, false);
    assert.ok(!llm.systemPrompts.at(-1)?.includes('Voice conversation'), 'typed turn: no voice rule');

    const followUpId = await service.enqueueFollowUpRun({ userId: owner.userId, chatId: chat.id, locale: null, voice: true });
    assert.ok(followUpId);
    const followUp = await service.waitForRun(followUpId);
    assert.equal(followUp.voice, true);
    assert.ok(llm.systemPrompts.at(-1)?.includes(AGENT_VOICE_RULE), 'follow-up of a voice turn speaks too');
    service.stop();

    console.log('agentVoice.integration: ok');
  } catch (error) {
    console.error(error);
    exitCode = 1;
  } finally {
    if (savedBudget === undefined) delete process.env.AGENT_DAILY_TOKEN_BUDGET;
    else process.env.AGENT_DAILY_TOKEN_BUDGET = savedBudget;
    delete process.env.AGENT_VOICE_ENABLED;
    setAgentVoiceProviderForTests(undefined);
    server.close();
    await clearUsage().catch((e) => console.error(e));
    await prisma.agentChat.deleteMany({ where: { id: { in: chatIds } } }).catch((e) => console.error(e));
    await fixture.cleanup().catch((e) => console.error(e));
    await prisma.$disconnect();
    process.exit(exitCode);
  }
})();
