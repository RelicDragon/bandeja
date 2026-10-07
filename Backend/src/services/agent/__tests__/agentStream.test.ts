/**
 * Pure tests (no DB): SSE framing + replay cursor + event logs (memory, fake Redis, text.delta
 * coalescing), the shared message rate store, tool-call delta
 * accumulation, history folding / tool-pair sanitation, locale, flags.
 */
import assert from 'node:assert/strict';
import { AgentMessageRole } from '@prisma/client';
import type { Options } from 'express-rate-limit';
import type { AgentStreamEvent } from '@bandeja/shared/agentContract';
import { resolveAgentEnvConfig } from '../../../config/agentEnv';
import { autoTitleFromText } from '../agentChat.service';
import {
  AGENT_ELISION_MIN_CHARS,
  AGENT_REPLY_LANGUAGE_REMINDER,
  AGENT_SNAPSHOT_ELIDED,
  AGENT_SNAPSHOT_HEADER,
  agentElisionBoundary,
  agentReplyLanguageReminder,
  agentTurnMessages,
  buildAgentModelHistory,
  estimateAgentTokens,
  resolveAgentLocale,
  sanitizeToolPairs,
  trimAgentContext,
} from '../agentContext.service';
import { agentMessageLanguage } from '../agentLanguageHint';
import {
  AGENT_SYNTHETIC_EVENT_ID_BASE,
  agentEventsChannel,
  buildSyntheticAgentReplay,
  CoalescingAgentEventStore,
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
import { agentApiError, startOfUtcDay } from '../agentGuards';
import { agentBudgetRetryAt } from '../agentBudgetWindow';
import { AgentMessageRateStore, type AgentRateRedisPort } from '../agentMessageRateLimit';
import { AGENT_NARRATION_HOLD_MAX_CHARS, agentLlmRetryDelayMs, isAgentNarrationHeld, serializeToolContent } from '../agentRun.service';
import { retryAfterMs, ToolCallAccumulator, type AgentLlmMessage } from '../llm/deepseekStream';

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

type FakeRedisPort = AgentRedisPort & {
  /** Channels with at least one handler. */
  channels: Map<string, Set<(message: string) => void>>;
  /** Channel of every publish, in order. */
  published: string[];
};

/** In-memory stand-in for the store's Redis operations (+ pub/sub), mirroring `AGENT_APPEND_SCRIPT`. */
function fakeRedisPort(): FakeRedisPort {
  const strings = new Map<string, string>();
  const zsets = new Map<string, Map<string, number>>();
  const channels = new Map<string, Set<(message: string) => void>>();
  const published: string[] = [];
  return {
    channels,
    published,
    async setNx(key, value) {
      if (strings.has(key)) return false;
      strings.set(key, value);
      return true;
    },
    async exists(key) {
      return strings.has(key) || zsets.has(key);
    },
    async append(keys, input) {
      if (strings.has(keys.terminal)) return null;
      if (!input.terminal && (zsets.get(keys.events)?.size ?? 0) >= input.maxEvents) return null;
      const id = Number(strings.get(keys.seq) ?? '0') + 1;
      strings.set(keys.seq, String(id));
      // The script builds the member by concatenation: it must equal JSON.stringify(stored).
      const stored = `{"id":${id},"event":${input.eventJson}}`;
      assert.equal(stored, JSON.stringify({ id, event: JSON.parse(input.eventJson) }));
      const set = zsets.get(keys.events) ?? new Map<string, number>();
      set.set(stored, id);
      zsets.set(keys.events, set);
      if (input.terminal) strings.set(keys.terminal, '1');
      published.push(input.channel);
      for (const handler of channels.get(input.channel) ?? []) setImmediate(() => handler(stored));
      return id;
    },
    async zRangeAfter(key, afterScore) {
      return [...(zsets.get(key) ?? new Map<string, number>()).entries()]
        .filter(([, score]) => score > afterScore)
        .sort((a, b) => a[1] - b[1])
        .map(([member]) => member);
    },
    async subscribe(channel, onMessage) {
      const set = channels.get(channel) ?? new Set();
      set.add(onMessage);
      channels.set(channel, set);
    },
    async unsubscribe(channel, onMessage) {
      const set = channels.get(channel);
      set?.delete(onMessage);
      if (set && set.size === 0) channels.delete(channel);
    },
  };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
  const unsubscribeX = api.subscribe('x', (stored) => seen.push(stored.id));
  await tick();
  await worker.append('x', { type: 'text.delta', text: 'a' });
  await worker.append('y', { type: 'run.started', runId: 'y', chatId: 'c1' });
  await worker.append('x', { type: 'run.cancelled' });
  await tick();
  assert.deepEqual(seen, [1, 2], 'only the subscribed run, in order');
  assert.equal(await api.isTerminal('x'), true);

  // A channel per run, held only while this process has listeners for it.
  assert.deepEqual(port.published, [agentEventsChannel('x'), agentEventsChannel('y'), agentEventsChannel('x')]);
  assert.deepEqual([...port.channels.keys()], [agentEventsChannel('x')], 'nobody listens to y');
  const second = api.subscribe('x', () => {});
  unsubscribeX();
  await tick();
  assert.ok(port.channels.has(agentEventsChannel('x')), 'kept while a listener remains');
  second();
  await tick();
  assert.equal(port.channels.size, 0, 'dropped with the last listener');
  assert.deepEqual(api.subscribedRunIds(), []);

  // `read` waits for the SUBSCRIBE confirmation, so replay + live leave no gap.
  const slow = fakeRedisPort();
  const order: string[] = [];
  const slowStore = new RedisAgentEventStore({
    ...slow,
    async subscribe(channel, onMessage) {
      await sleep(15);
      order.push('subscribed');
      await slow.subscribe(channel, onMessage);
    },
    async zRangeAfter(key, afterScore) {
      order.push('read');
      return slow.zRangeAfter(key, afterScore);
    },
  });
  await slowStore.open('z');
  const off = slowStore.subscribe('z', () => {});
  await slowStore.read('z', 0);
  assert.deepEqual(order, ['subscribed', 'read']);
  off();
  console.log('event stores (memory + redis): ok');
}

async function exerciseCoalescing(inner: AgentEventStore, label: string) {
  const store = new CoalescingAgentEventStore(inner, 20);
  assert.equal(store.kind, inner.kind);
  await store.open('c1');
  const live: AgentStoredEvent[] = [];
  const unsubscribe = store.subscribe('c1', (stored) => live.push(stored));
  await tick();
  await store.append('c1', { type: 'run.started', runId: 'c1', chatId: 'chat' });
  assert.equal(await store.append('c1', { type: 'text.delta', text: 'Hel' }), null, `${label}: a delta resolves at once`);
  await store.append('c1', { type: 'text.delta', text: 'lo' });
  assert.deepEqual((await store.read('c1', 0)).map((e) => e.event.type), ['run.started'], `${label}: deltas buffered`);
  await sleep(50);
  const afterTimer = await store.read('c1', 0);
  assert.deepEqual(
    afterTimer.map((e) => [e.id, e.event]),
    [
      [1, { type: 'run.started', runId: 'c1', chatId: 'chat' }],
      [2, { type: 'text.delta', text: 'Hello' }],
    ],
    `${label}: one ordinary delta per window`,
  );
  // A non-delta event stores the pending text first (no waiting for the timer).
  await store.append('c1', { type: 'text.delta', text: ' wor' });
  await store.append('c1', { type: 'text.delta', text: 'ld' });
  const started = await store.append('c1', { type: 'tool.started', callId: 'k', name: 'get_game', label: 'Game' });
  assert.equal(started?.id, 4, `${label}: tool.started after the flushed delta`);
  await store.append('c1', { type: 'text.delta', text: '!' });
  await store.flush('c1');
  await store.append('c1', { type: 'text.delta', text: ' Bye' });
  await store.append('c1', { type: 'run.completed', status: 'COMPLETED', usage: { inputTokens: 1, outputTokens: 1 } });
  await tick();
  const all = await store.read('c1', 0);
  assert.deepEqual(all.map((e) => e.id), [1, 2, 3, 4, 5, 6, 7], `${label}: ids monotonic`);
  assert.deepEqual(
    all.map((e) => e.event.type),
    ['run.started', 'text.delta', 'text.delta', 'tool.started', 'text.delta', 'text.delta', 'run.completed'],
  );
  assert.equal(
    all.filter((e) => e.event.type === 'text.delta').map((e) => (e.event as { text: string }).text).join(''),
    'Hello world! Bye',
    `${label}: replay holds every character`,
  );
  assert.deepEqual(live.map((e) => e.id), [1, 2, 3, 4, 5, 6, 7], `${label}: live fan-out matches the log`);
  unsubscribe();
  await tick();
  assert.equal(store.pendingRunCount(), 0, `${label}: per-run state released`);
}

async function testCoalescing() {
  await exerciseCoalescing(new InMemoryAgentEventStore(50), 'memory');
  await exerciseCoalescing(new RedisAgentEventStore(fakeRedisPort()), 'redis');
  console.log('text.delta coalescing (memory + redis): ok');
}

/** Two processes sharing one Redis counter; a failing Redis falls back to memory. */
async function testRateStore() {
  const counters = new Map<string, number>();
  const shared: AgentRateRedisPort = {
    async increment(key) {
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return { totalHits: next, ttlMs: 60_000 };
    },
    async decrement(key) {
      counters.set(key, Math.max(0, (counters.get(key) ?? 0) - 1));
    },
    async reset(key) {
      counters.delete(key);
    },
  };
  const a = new AgentMessageRateStore(shared);
  const b = new AgentMessageRateStore(shared);
  a.init({ windowMs: 60_000 } as Options);
  b.init({ windowMs: 60_000 } as Options);
  assert.equal(a.localKeys, false);
  assert.equal((await a.increment('u1')).totalHits, 1);
  const second = await b.increment('u1');
  assert.equal(second.totalHits, 2, 'one bucket across processes');
  assert.ok(second.resetTime && second.resetTime.getTime() > Date.now() + 50_000);
  await b.decrement('u1');
  assert.equal(counters.get('pp:agent:msg-rate:u1'), 1);

  const down = new AgentMessageRateStore({
    increment: () => Promise.reject(new Error('down')),
    decrement: () => Promise.reject(new Error('down')),
    reset: () => Promise.reject(new Error('down')),
  });
  down.init({ windowMs: 60_000 } as Options);
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.equal((await down.increment('u1')).totalHits, 1, 'memory fallback');
    assert.equal((await down.increment('u1')).totalHits, 2);
  } finally {
    console.error = originalError;
  }
  const local = new AgentMessageRateStore(null);
  local.init({ windowMs: 60_000 } as Options);
  assert.equal(local.localKeys, true);
  assert.equal((await local.increment('u2')).totalHits, 1);
  a.shutdown();
  b.shutdown();
  down.shutdown();
  local.shutdown();

  assert.equal(agentBudgetRetryAt(new Date('2026-09-30T23:30:00+02:00')), '2026-10-01T00:00:00.000Z');
  assert.equal(agentBudgetRetryAt(new Date('2026-12-31T23:59:59Z')), '2027-01-01T00:00:00.000Z');
  const budgetError = agentApiError(429, 'BUDGET_EXCEEDED', 'x', { retryAt: new Date('2026-10-01T00:00:00Z') });
  assert.deepEqual(budgetError.data, { code: 'BUDGET_EXCEEDED', retryAt: '2026-10-01T00:00:00.000Z' });
  assert.deepEqual(agentApiError(429, 'RATE_LIMITED', 'x').data, { code: 'RATE_LIMITED' });
  console.log('rate store (redis + fallback) / budget window: ok');
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
  assert.ok(JSON.parse(big).truncated.note.startsWith('INCOMPLETE'));

  // Lists are cut by whole items, stay valid JSON and say how many were left out.
  const fixtures = Array.from({ length: 200 }, (_, i) => ({ fixtureId: `f${i}`, teams: [['A'.repeat(60)], ['B'.repeat(60)]] }));
  const listed = JSON.parse(serializeToolContent({ ok: true, data: { total: 200, fixtures, rounds: [{ id: 'r1' }] } }));
  assert.ok(JSON.stringify(listed).length <= 16_000);
  assert.equal(listed.data.total, 200);
  assert.deepEqual(listed.data.rounds, [{ id: 'r1' }], 'small lists are kept');
  assert.equal(listed.data.fixtures[0].fixtureId, 'f0', 'items are dropped from the end');
  assert.equal(listed.truncated.omitted['data.fixtures'] + listed.data.fixtures.length, 200);
  const small = JSON.parse(serializeToolContent({ ok: true, data: { fixtures: [1, 2] } }));
  assert.equal(small.truncated, undefined);
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

/** `turns` user turns; each calls get_game (a big result) and answers; user turns store their triple. */
function chatWithToolTurns(turns: number) {
  const out = [];
  let seq = 0;
  for (let i = 0; i < turns; i += 1) {
    const callId = `c${i}`;
    out.push({ ...msg((seq += 1), AgentMessageRole.USER, `question ${i}`, agentTurnMessages(`question ${i}`, `${AGENT_SNAPSHOT_HEADER}\nturn ${i}`)) });
    out.push(msg((seq += 1), AgentMessageRole.ASSISTANT, null, [{ role: 'assistant', content: null, tool_calls: [{ id: callId, type: 'function', function: { name: 'get_game', arguments: '{}' } }] }]));
    out.push({
      seq: (seq += 1),
      role: AgentMessageRole.TOOL,
      content: [{ type: 'tool_result', callId, ok: true, summary: `Game ${i}` }],
      llmMessages: [{ role: 'tool', tool_call_id: callId, content: JSON.stringify({ ok: true, data: { pad: 'x'.repeat(AGENT_ELISION_MIN_CHARS) } }) }] as unknown as null,
    });
    out.push(msg((seq += 1), AgentMessageRole.ASSISTANT, `answer ${i}`, [{ role: 'assistant', content: `answer ${i}` }]));
  }
  return out;
}

function testElisionAndTrim() {
  assert.deepEqual([0, 3, 7, 8, 12, 13].map((turns) => agentElisionBoundary(turns)), [0, 0, 0, 5, 5, 10]);

  const seven = buildAgentModelHistory(chatWithToolTurns(7));
  assert.deepEqual(seven, sanitizeToolPairs(seven), 'pairs stay valid');
  assert.ok(seven.every((m) => m.role !== 'tool' || !m.content.includes('"elided"')), '≤ 7 turns: nothing elided');
  assert.equal(seven.filter((m) => m.role === 'system' && String(m.content).startsWith(AGENT_SNAPSHOT_HEADER)).length, 7, 'stored snapshots replay');

  const eight = buildAgentModelHistory(chatWithToolTurns(8));
  const tools = eight.filter((m): m is Extract<AgentLlmMessage, { role: 'tool' }> => m.role === 'tool');
  assert.equal(tools.length, 8, 'every call keeps its reply');
  assert.deepEqual(JSON.parse(tools[0].content), { elided: true, tool: 'get_game', ok: true, summary: 'Game 0', note: 'Old result left out; call the tool again for details.' });
  assert.ok(tools.slice(5).every((m) => !m.content.includes('"elided"')), 'the last turns stay in full');
  assert.equal(eight.filter((m) => m.content === AGENT_SNAPSHOT_ELIDED).length, 5, 'old snapshots stubbed');
  // Stable inside a chunk: turn 9 replays turns 1–8 exactly as turn 8 did (prompt-cache prefix).
  const nine = buildAgentModelHistory(chatWithToolTurns(9));
  assert.deepEqual(nine.slice(0, eight.length), eight, 'append-only between boundary moves');

  // Trim: over 70% of the window → oldest whole turns go, the latest stays, pairs stay valid.
  const big = [{ role: 'system' as const, content: 'rules' }, ...buildAgentModelHistory(chatWithToolTurns(6))];
  const before = estimateAgentTokens(big);
  assert.equal(trimAgentContext([...big], 0, before * 2), 0, 'under the limit: untouched');
  const trimmed = [...big];
  const dropped = trimAgentContext(trimmed, 0, Math.ceil(before / 0.75));
  assert.ok(dropped >= 1 && dropped < 6);
  assert.equal(trimmed[0].content, 'rules');
  assert.match(String(trimmed[1].content), /left out to fit the context window/);
  assert.deepEqual(trimmed.slice(1), sanitizeToolPairs(trimmed.slice(1)));
  assert.equal(trimmed.filter((m) => m.role === 'user').at(-1)?.content, 'question 5');
  assert.ok(estimateAgentTokens(trimmed) <= Math.ceil(before / 0.75) * 0.5 + 50);
  console.log('elision + trim: ok');
}

function testLlmRetryHelpers() {
  assert.equal(retryAfterMs({ 'retry-after': '2' }), 2000);
  assert.equal(retryAfterMs(new Headers({ 'retry-after-ms': '150' })), 150);
  assert.equal(retryAfterMs({ 'retry-after': new Date(10_000).toUTCString() }, 4_000), 6_000);
  assert.equal(retryAfterMs({}), null);
  assert.equal(agentLlmRetryDelayMs(1, 500, 60_000), 5_000, 'retry-after is capped');
  for (const retry of [1, 2]) {
    const delay = agentLlmRetryDelayMs(retry, 500, null);
    assert.ok(delay >= 250 * 2 ** (retry - 1) && delay <= 500 * 2 ** (retry - 1), `jittered backoff ${retry}`);
  }
  console.log('llm retry helpers: ok');
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
  assert.equal(defaults.fallbackModel, null);
  assert.equal(defaults.maxOutputTokens, 4096);
  assert.equal(defaults.llmMaxRetries, 2);
  assert.equal(defaults.toolTimeoutMs, 15_000);
  assert.equal(defaults.cachedTokenWeight, 0.1);
  assert.equal(resolveAgentEnvConfig({ AGENT_CACHED_TOKEN_WEIGHT: '3' }).cachedTokenWeight, 1, 'clamped');
  assert.equal(resolveAgentEnvConfig({ AGENT_FALLBACK_MODEL: ' deepseek-chat ' }).fallbackModel, 'deepseek-chat');
  assert.equal(startOfUtcDay(new Date('2026-09-30T23:30:00+02:00')).toISOString(), '2026-09-30T00:00:00.000Z');
  console.log('locale / title / config: ok');
}

function testNarrationHold() {
  assert.equal(isAgentNarrationHeld(''), true);
  assert.equal(isAgentNarrationHeld("I'll look for that game."), true, 'one short line is held');
  assert.equal(isAgentNarrationHeld("I'll look for that game.\n\n"), true, 'trailing blank lines keep it held');
  assert.equal(isAgentNarrationHeld("Here's what you have:\n\n- Evening"), false, 'a second line with content releases');
  assert.equal(isAgentNarrationHeld('x'.repeat(AGENT_NARRATION_HOLD_MAX_CHARS + 1)), false, 'long text releases');
  console.log('narration hold: ok');
}

function testLanguageHint() {
  const cases: [string, string | null][] = [
    ["Thanks. And what's the weather going to be for that game?", 'en'],
    ["Remember that I'm left-handed and I always play on the left side.", 'en'],
    ['When and where is my next game?', 'en'],
    ["Who's still missing?", 'en'],
    ['Move my Thursday game to 19:00', 'en'],
    ["Who's leading my league?", 'en'],
    ['Какая погода будет во время моей завтрашней игры?', 'ru'],
    ['Која је моја следећа игра?', 'sr'],
    ['Отмени игру Morning americano.', 'ru'],
    ['Откажи игру Morning americano.', 'sr'],
    ['Игра Morning americano', null],
    ['Hvala. Ko još igra sa mnom tada?', null],
    ['¿Qué recuerdas de mí?', null],
    ['Hola, que tal el partido', null],
    ['Invite Jelena Popović to my game tomorrow', null],
    ['Apakah ada permainan besok?', null],
    ['明日の試合をキャンセルして', 'ja'],
    ['明天我的比赛几点', 'zh'],
    ['พรุ่งนี้ฝนจะตกไหม', 'th'],
    ['ألغِ مباراتي غدًا', 'ar'],
    ['कल मेरा गेम कब है', 'hi'],
    ['ok', null],
    ['[slot:s1.abc]', null],
  ];
  for (const [text, want] of cases) assert.equal(agentMessageLanguage(text), want, text);
  assert.equal(agentReplyLanguageReminder('Игра Morning americano'), AGENT_REPLY_LANGUAGE_REMINDER, 'unsure → generic');
  assert.ok(agentReplyLanguageReminder('When is my next game?').startsWith('Reply language: English'));
  console.log('language hint: ok');
}

async function main() {
  testSseAndStore();
  await testStores();
  await testCoalescing();
  await testRateStore();
  testSynthetic();
  await testSemaphore();
  testAccumulator();
  testHistory();
  testElisionAndTrim();
  testLlmRetryHelpers();
  testMisc();
  testNarrationHold();
  testLanguageHint();
  console.log('agentStream.test.ts: ok');
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
