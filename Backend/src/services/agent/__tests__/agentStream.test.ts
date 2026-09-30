/**
 * Pure tests (no DB): SSE framing + replay cursor + in-memory event log, tool-call delta
 * accumulation, history folding / tool-pair sanitation, locale, flags.
 */
import assert from 'node:assert/strict';
import { AgentMessageRole } from '@prisma/client';
import type { AgentStreamEvent } from '@bandeja/shared/agentContract';
import { resolveAgentEnvConfig } from '../../../config/agentEnv';
import { autoTitleFromText } from '../agentChat.service';
import { buildAgentModelHistory, resolveAgentLocale, sanitizeToolPairs } from '../agentContext.service';
import {
  AGENT_SYNTHETIC_EVENT_ID_BASE,
  buildSyntheticAgentReplay,
  formatAgentSseFrame,
  InMemoryAgentEventStore,
  isAgentEventStreamPath,
  parseAgentReplayCursor,
  RedisAgentEventStore,
  type AgentEventStore,
  type AgentRedisPort,
  type AgentStoredEvent,
} from '../agentEvents';
import { Semaphore } from '../llm/semaphore';
import { startOfUtcDay } from '../agentGuards';
import { serializeToolContent } from '../agentRun.service';
import { ToolCallAccumulator, type AgentLlmMessage } from '../llm/deepseekStream';

/** Minimal SSE parser (what a browser does) to prove frames round-trip. */
function parseSse(text: string): { id: string | null; event: string | null; data: string }[] {
  const out: { id: string | null; event: string | null; data: string }[] = [];
  for (const block of text.split('\n\n')) {
    if (!block.trim()) continue;
    let id: string | null = null;
    let event: string | null = null;
    const data: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith(':')) continue;
      const colon = line.indexOf(':');
      const field = line.slice(0, colon);
      const value = line.slice(colon + 1).replace(/^ /, '');
      if (field === 'id') id = value;
      else if (field === 'event') event = value;
      else if (field === 'data') data.push(value);
    }
    if (data.length) out.push({ id, event, data: data.join('\n') });
  }
  return out;
}

function testSseAndStore() {
  const tricky: AgentStreamEvent = { type: 'text.delta', text: 'line1\nline2\n\ndata: fake\r\nid: 99' };
  const frame = formatAgentSseFrame({ id: 7, event: tricky });
  const parsed = parseSse(`: keepalive\n\n${frame}`);
  assert.equal(parsed.length, 1, 'newlines in text never split a frame');
  assert.equal(parsed[0].id, '7');
  assert.equal(parsed[0].event, 'text.delta');
  assert.deepEqual(JSON.parse(parsed[0].data), tricky);

  assert.equal(parseAgentReplayCursor(undefined, undefined), 0);
  assert.equal(parseAgentReplayCursor('5', undefined), 5);
  assert.equal(parseAgentReplayCursor(undefined, '12'), 12);
  assert.equal(parseAgentReplayCursor('5', '12'), 12, 'the larger cursor wins');
  assert.equal(parseAgentReplayCursor(['9', '1'], undefined), 9);
  assert.equal(parseAgentReplayCursor('-3', 'abc'), 0);
  assert.equal(parseAgentReplayCursor('1e3', ' 4 '), 4);
  assert.equal(parseAgentReplayCursor('99999999999999999999', undefined), 0);

  assert.ok(isAgentEventStreamPath('/api/agent/runs/abc123/events'));
  assert.ok(!isAgentEventStreamPath('/api/agent/runs/abc123/cancel'));
  assert.ok(!isAgentEventStreamPath('/api/agent/chats'));

  console.log('sse framing: ok');
}

async function exerciseStore(store: AgentEventStore, label: string) {
  await store.open('r1');
  const live: AgentStoredEvent[] = [];
  const unsubscribe = store.subscribe('r1', (stored) => live.push(stored));
  await store.append('r1', { type: 'run.queued', runId: 'r1', chatId: 'c1', position: 2 });
  await store.append('r1', { type: 'run.started', runId: 'r1', chatId: 'c1' });
  await store.append('r1', { type: 'text.delta', text: 'Hel' });
  await store.append('r1', { type: 'text.delta', text: 'lo' });
  assert.deepEqual((await store.read('r1', 0)).map((e) => e.id), [1, 2, 3, 4], `${label}: ids monotonic from 1`);
  assert.deepEqual(
    (await store.read('r1', 0)).filter((e) => e.event.type === 'text.delta').map((e) => (e.event as { text: string }).text).join(''),
    'Hello',
    `${label}: partial text recoverable from a full replay`,
  );
  assert.deepEqual((await store.read('r1', 3)).map((e) => e.id), [4], `${label}: replay after cursor`);
  assert.equal(await store.isTerminal('r1'), false);
  await store.append('r1', { type: 'run.completed', status: 'COMPLETED', usage: { inputTokens: 1, outputTokens: 2 } });
  assert.equal(await store.isTerminal('r1'), true);
  assert.equal(await store.append('r1', { type: 'text.delta', text: 'late' }), null, `${label}: nothing after terminal`);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(live.map((e) => e.id), [1, 2, 3, 4, 5], `${label}: live fan-out`);
  unsubscribe();
  assert.equal(await store.has('r2'), false);
  assert.deepEqual(await store.read('r2', 0), []);

  // A log re-opened for an older run (restart) hands out ids above any earlier log's.
  await store.open('r3', { resumed: true });
  const resumed = await store.append('r3', { type: 'run.started', runId: 'r3', chatId: 'c1' });
  assert.ok(resumed && resumed.id > 1_000_000_000_000_000 && resumed.id < AGENT_SYNTHETIC_EVENT_ID_BASE, `${label}: resumed ids`);
}

/** In-memory stand-in for the handful of Redis commands the store uses (+ pub/sub). */
function fakeRedisPort(): AgentRedisPort {
  const strings = new Map<string, string>();
  const zsets = new Map<string, Map<string, number>>();
  const subscribers = new Map<string, ((message: string) => void)[]>();
  return {
    async setNx(key, value) {
      if (strings.has(key)) return false;
      strings.set(key, value);
      return true;
    },
    async exists(key) {
      return strings.has(key) || zsets.has(key);
    },
    async incr(key) {
      const next = Number(strings.get(key) ?? '0') + 1;
      strings.set(key, String(next));
      return next;
    },
    async zAdd(key, score, member) {
      const set = zsets.get(key) ?? new Map<string, number>();
      set.set(member, score);
      zsets.set(key, set);
    },
    async zRangeAfter(key, afterScore) {
      return [...(zsets.get(key) ?? new Map<string, number>()).entries()]
        .filter(([, score]) => score > afterScore)
        .sort((a, b) => a[1] - b[1])
        .map(([member]) => member);
    },
    async set(key, value) {
      strings.set(key, value);
    },
    async expire() {},
    async zCard(key) {
      return zsets.get(key)?.size ?? 0;
    },
    async publish(channel, message) {
      for (const handler of subscribers.get(channel) ?? []) setImmediate(() => handler(message));
    },
    async subscribe(channel, onMessage) {
      subscribers.set(channel, [...(subscribers.get(channel) ?? []), onMessage]);
    },
  };
}

async function testStores() {
  const memory = new InMemoryAgentEventStore(50);
  await exerciseStore(memory, 'memory');
  memory.clear();
  await exerciseStore(new RedisAgentEventStore(fakeRedisPort()), 'redis');

  // Two processes sharing one Redis: events appended by the executor reach the API process.
  const port = fakeRedisPort();
  const worker = new RedisAgentEventStore(port);
  const api = new RedisAgentEventStore(port);
  await api.open('x');
  const seen: number[] = [];
  api.subscribe('x', (stored) => seen.push(stored.id));
  await new Promise((resolve) => setImmediate(resolve));
  await worker.append('x', { type: 'text.delta', text: 'a' });
  await worker.append('x', { type: 'run.cancelled' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(seen, [1, 2]);
  assert.equal(await api.isTerminal('x'), true);
  console.log('event stores (memory + redis): ok');
}

async function testSemaphore() {
  let limit = 2;
  const gate = new Semaphore(() => limit);
  const a = await gate.acquire();
  const b = await gate.acquire();
  let thirdIn = false;
  const third = gate.acquire().then((release) => {
    thirdIn = true;
    return release;
  });
  const controller = new AbortController();
  const fourth = gate.acquire(controller.signal);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(gate.active, 2);
  assert.equal(thirdIn, false, 'third waits');
  controller.abort('cancelled');
  await assert.rejects(fourth);
  a();
  a(); // double release is a no-op
  const releaseThird = await third;
  assert.equal(thirdIn, true);
  assert.equal(gate.active, 2);
  b();
  releaseThird();
  assert.equal(gate.active, 0);
  limit = 1;
  const only = await gate.acquire();
  assert.equal(gate.active, 1);
  only();
  console.log('llm semaphore: ok');
}

function testSynthetic() {
  const synthetic = buildSyntheticAgentReplay(
    [
      { type: 'run.started', runId: 'r1', chatId: 'c1' },
      { type: 'run.cancelled' },
    ],
    1_800_000_000_000_000,
  );
  assert.deepEqual(synthetic.map((e) => e.id), [AGENT_SYNTHETIC_EVENT_ID_BASE + 1, AGENT_SYNTHETIC_EVENT_ID_BASE + 2], 'above live + resumed ids');
  assert.deepEqual(
    buildSyntheticAgentReplay([{ type: 'run.cancelled' }], AGENT_SYNTHETIC_EVENT_ID_BASE + 1),
    [],
    'a client that already applied the synthetic terminal gets nothing',
  );
  console.log('synthetic replay ids: ok');
}

function testAccumulator() {
  const acc = new ToolCallAccumulator();
  acc.add({ index: 0, id: 'call_a', name: 'get_game', arguments: '{"game' });
  acc.add({ index: 1, name: 'search_games', arguments: '{}' });
  acc.add({ index: 0, arguments: 'Id":"g1"}' });
  acc.add({ index: 2, arguments: '{"orphan":true}' });
  const calls = acc.calls('run_abcdefgh', 3);
  assert.deepEqual(calls, [
    { id: 'call_a', type: 'function', function: { name: 'get_game', arguments: '{"gameId":"g1"}' } },
    { id: 'call_abcdefgh_3_1', type: 'function', function: { name: 'search_games', arguments: '{}' } },
  ]);

  const big = serializeToolContent({ ok: true, data: { blob: 'x'.repeat(40_000) } });
  assert.ok(big.length < 17_000);
  assert.equal(JSON.parse(big).truncated, true);
  console.log('tool call accumulator: ok');
}

function msg(seq: number, role: AgentMessageRole, text: string | null, llmMessages: AgentLlmMessage[] | null = null) {
  return {
    seq,
    role,
    content: text ? [{ type: 'text', text }] : [],
    llmMessages: llmMessages as unknown as null,
  };
}

function testHistory() {
  const call = { id: 'c1', type: 'function' as const, function: { name: 'get_game', arguments: '{}' } };
  const history = buildAgentModelHistory([
    msg(1, AgentMessageRole.USER, 'hi'),
    msg(2, AgentMessageRole.ASSISTANT, null, [{ role: 'assistant', content: null, tool_calls: [call] }]),
    msg(3, AgentMessageRole.TOOL, null, [{ role: 'tool', tool_call_id: 'c1', content: '{"ok":true}' }]),
    msg(4, AgentMessageRole.ASSISTANT, 'Done', [{ role: 'assistant', content: 'Done' }]),
  ]);
  assert.deepEqual(history.map((m) => m.role), ['user', 'assistant', 'tool', 'assistant']);

  // A step cancelled between the tool_calls and their results: drop the dangling calls.
  const broken = sanitizeToolPairs([
    { role: 'user', content: 'q' },
    { role: 'assistant', content: 'partial', tool_calls: [call, { ...call, id: 'c2' }] },
    { role: 'tool', tool_call_id: 'c1', content: '{}' },
    { role: 'tool', tool_call_id: 'zzz', content: '{}' },
    { role: 'user', content: 'again' },
  ]);
  assert.deepEqual(broken, [
    { role: 'user', content: 'q' },
    { role: 'assistant', content: 'partial' },
    { role: 'user', content: 'again' },
  ]);

  const long = [];
  for (let i = 0; i < 40; i += 1) {
    long.push(msg(i * 2 + 1, AgentMessageRole.USER, `question ${i}`));
    long.push(msg(i * 2 + 2, AgentMessageRole.ASSISTANT, `answer ${i}`, [{ role: 'assistant', content: `answer ${i}` }]));
  }
  const folded = buildAgentModelHistory(long, 30);
  assert.equal(folded[0].role, 'system');
  assert.match(folded[0].content as string, /User: question 0\nAssistant: answer 0/);
  assert.match(folded[0].content as string, /not instructions/);
  assert.ok(!(folded[0].content as string).includes('question 10'));
  assert.equal(folded.filter((m) => m.role === 'user').length, 30);
  assert.equal(folded[1].content, 'question 10');
  console.log('history folding: ok');
}

function testMisc() {
  assert.equal(resolveAgentLocale('ru-RU', 'en'), 'ru');
  assert.equal(resolveAgentLocale(null, 'auto'), 'en');
  assert.equal(resolveAgentLocale(undefined, 'sr'), 'sr');
  assert.equal(resolveAgentLocale('<script>', 'es'), 'es');

  assert.equal(autoTitleFromText('  Move my\nThursday game  '), 'Move my Thursday game');
  const title = autoTitleFromText('word '.repeat(40));
  assert.ok(title.length <= 60 && title.endsWith('…'));
  // App card tokens never reach chat titles (booking slice 7d).
  assert.equal(autoTitleFromText('Book this slot: Club X, Oct 2 18:00 [slot:s1.abc-_.sig]'), 'Book this slot: Club X, Oct 2 18:00');
  assert.equal(autoTitleFromText('[booking:geb:abc123] Cancel booking Club X'), 'Cancel booking Club X');
  assert.equal(autoTitleFromText('[slot:s1.x.y]'), '');

  const defaults = resolveAgentEnvConfig({});
  assert.equal(defaults.model, 'deepseek-flash');
  assert.equal(defaults.maxSteps, 8);
  assert.equal(defaults.runTimeoutMs, 60_000);
  assert.equal(defaults.maxConcurrentRuns, 4);
  assert.equal(defaults.maxConcurrentRunsPerUser, 1);
  assert.equal(defaults.maxQueuedRunsPerUser, 3);
  assert.equal(defaults.maxConcurrentLlmCalls, 4);
  assert.equal(resolveAgentEnvConfig({ AGENT_MAX_STEPS: '99' }).maxSteps, 20, 'clamped');
  assert.equal(startOfUtcDay(new Date('2026-09-30T23:30:00+02:00')).toISOString(), '2026-09-30T00:00:00.000Z');
  console.log('locale / title / config: ok');
}

async function main() {
  testSseAndStore();
  await testStores();
  testSynthetic();
  await testSemaphore();
  testAccumulator();
  testHistory();
  testMisc();
  console.log('agentStream.test.ts: ok');
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
