import assert from 'node:assert/strict';
import type {
  AgentEntityRef,
  AgentMessageDto,
  AgentPendingActionDto,
  AgentStreamEvent,
} from '@bandeja/shared/agentContract';
import type { InlineKeyboardMarkup } from 'grammy/types';
import { telegramHtmlTextLength } from '../../shared/telegramMarkdown';
import { type AgentBotRunBinding, AgentBotStateStore, MemoryAgentBotKv } from '../agentBotState';
import { AgentBotRunWatcher, type AgentBotTelegramApi, type OpenAgentRunFeed } from '../agentBotRunWatcher';
import {
  initialAgentBotRunState,
  parseAgentCallback,
  reduceAgentBotRun,
  renderAgentBotStatus,
} from '../agentBotView';

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
/** Lets zero-interval throttler timers (`setTimeout(0)`) and promise chains run. */
const settle = async (n = 20) => {
  for (let i = 0; i < n; i += 1) {
    await tick();
    await new Promise<void>((resolve) => setTimeout(resolve, 1));
  }
};

type Sent = { kind: 'send' | 'edit'; messageId: number; text: string; keyboard?: InlineKeyboardMarkup };

class FakeBotApi implements AgentBotTelegramApi {
  log: Sent[] = [];
  private nextId = 500;
  failEditsWith: unknown = null;

  async sendMessage(_chatId: number, text: string, other: { reply_markup?: InlineKeyboardMarkup }) {
    const messageId = this.nextId++;
    this.log.push({ kind: 'send', messageId, text, keyboard: other.reply_markup });
    return { message_id: messageId };
  }

  async editMessageText(_chatId: number, messageId: number, text: string, other: { reply_markup?: InlineKeyboardMarkup }) {
    if (this.failEditsWith) throw this.failEditsWith;
    this.log.push({ kind: 'edit', messageId, text, keyboard: other.reply_markup });
    return true;
  }

  async editMessageReplyMarkup() {
    return true;
  }

  edits(messageId: number): Sent[] {
    return this.log.filter((entry) => entry.kind === 'edit' && entry.messageId === messageId);
  }

  sends(): Sent[] {
    return this.log.filter((entry) => entry.kind === 'send');
  }
}

/** Feed under test control: `emit` pushes events; a terminal event ends it. */
class FakeFeeds {
  private listeners = new Map<string, { onEvent: (e: AgentStreamEvent) => void; onEnd: () => void }>();
  backlog = new Map<string, AgentStreamEvent[]>();
  missing = new Set<string>();

  open: OpenAgentRunFeed = async (binding, onEvent, onEnd) => {
    if (this.missing.has(binding.runId)) return null;
    this.listeners.set(binding.runId, { onEvent, onEnd });
    for (const event of this.backlog.get(binding.runId) ?? []) this.emitNow(binding.runId, event);
    return { close: () => this.listeners.delete(binding.runId) };
  };

  private emitNow(runId: string, event: AgentStreamEvent): void {
    const listener = this.listeners.get(runId);
    if (!listener) return;
    listener.onEvent(event);
    if (event.type === 'run.completed' || event.type === 'run.failed' || event.type === 'run.cancelled') {
      this.listeners.delete(runId);
      listener.onEnd();
    }
  }

  async emit(runId: string, event: AgentStreamEvent): Promise<void> {
    this.emitNow(runId, event);
    await settle(5);
  }
}

const game: AgentEntityRef = {
  type: 'game',
  id: 'game_1',
  title: 'Thursday padel <3',
  entityType: 'GAME',
  status: 'ANNOUNCED',
  startTime: '2026-10-01T18:00:00.000Z',
  clubName: 'Club',
};

function assistantSaved(id: string, text: string, runId = 'run_1'): AgentStreamEvent {
  const message: AgentMessageDto = {
    id,
    chatId: 'chat_1',
    seq: 2,
    role: 'ASSISTANT',
    blocks: [{ type: 'text', text }],
    runId,
    createdAt: '2026-09-30T10:00:00.000Z',
  };
  return { type: 'message.saved', message };
}

const pendingAction: AgentPendingActionDto = {
  id: 'act_1',
  chatId: 'chat_1',
  runId: 'run_1',
  toolName: 'update_game',
  status: 'PENDING',
  preview: {
    title: 'Change "Thursday <padel>"',
    lines: [{ label: 'Start', from: 'Thu 18:00', to: 'Thu 19:00' }],
    warnings: ['3 players will be notified'],
  },
  expiresAt: '2026-09-30T10:15:00.000Z',
  result: null,
  createdAt: '2026-09-30T10:00:00.000Z',
  autoApproved: false,
  riskTier: 'standard',
  canAlwaysAllow: true,
  execution: 'server',
};

function setup() {
  const api = new FakeBotApi();
  const feeds = new FakeFeeds();
  const state = new AgentBotStateStore(new MemoryAgentBotKv());
  const watcher = new AgentBotRunWatcher({
    api,
    state,
    openFeed: feeds.open,
    links: { frontendUrl: 'https://bandeja.me/', inlineUrlButtons: true },
    minIntervalMs: 0,
  });
  const binding: AgentBotRunBinding = {
    runId: 'run_1',
    userId: 'user_a',
    telegramChatId: 42,
    statusMessageId: 7,
    lang: 'en',
    createdAt: 0,
  };
  return { api, feeds, state, watcher, binding };
}

async function testFullRunMapsToStatusEditsFinalAndCard(): Promise<void> {
  const { api, feeds, state, watcher, binding } = setup();
  await state.saveBinding(binding);
  const done = watcher.watch(binding);
  await settle();

  await feeds.emit('run_1', { type: 'run.queued', runId: 'run_1', chatId: 'chat_1', position: 2 });
  assert.match(api.edits(7).at(-1)!.text, /Queued \(#2\)/);
  const stop = api.edits(7).at(-1)!.keyboard!.inline_keyboard[0][0];
  assert.equal('callback_data' in stop ? stop.callback_data : '', 'agent:stop:run_1');

  await feeds.emit('run_1', { type: 'run.started', runId: 'run_1', chatId: 'chat_1' });
  assert.match(api.edits(7).at(-1)!.text, /Thinking/);

  await feeds.emit('run_1', { type: 'tool.started', callId: 'c1', name: 'list_my_games', label: 'Looking up your games' });
  assert.match(api.edits(7).at(-1)!.text, /🔎 Looking up your games…/);

  await feeds.emit('run_1', { type: 'tool.finished', callId: 'c1', ok: true, summary: 'Games found: 1', entities: [game] });
  await feeds.emit('run_1', { type: 'text.delta', text: 'You have **one' });
  assert.match(api.edits(7).at(-1)!.text, /^You have \*\*one/, 'partial markdown streams as-is');
  await feeds.emit('run_1', { type: 'text.delta', text: '** game <soon>.' });
  assert.match(api.edits(7).at(-1)!.text, /You have <b>one<\/b> game &lt;soon&gt;\./);

  await feeds.emit('run_1', assistantSaved('m1', 'You have **one** game <soon>.'));
  await feeds.emit('run_1', { type: 'action.pending', action: pendingAction });
  await feeds.emit('run_1', {
    type: 'run.completed',
    status: 'AWAITING_CONFIRMATION',
    usage: { inputTokens: 1, outputTokens: 1 },
  });
  await done;

  const final = api.edits(7).at(-1)!;
  assert.equal(final.text, 'You have <b>one</b> game &lt;soon&gt;.');
  const rows = final.keyboard!.inline_keyboard;
  const link = rows[0][0];
  assert.equal('url' in link ? link.url : '', 'https://bandeja.me/games/game_1');
  assert.equal(link.text, '🎾 Thursday padel <3', 'button text is plain text, no escaping needed');
  assert.deepEqual(
    rows.slice(-2).map((row) => row.map((b) => ('callback_data' in b ? b.callback_data : ''))),
    [
      ['agent:new', 'agent:list'],
      ['agent:perms', 'agent:exit'],
    ],
  );

  const [card] = api.sends();
  assert.ok(card, 'confirmation card sent');
  assert.match(card.text, /📝 <b>Change &quot;Thursday &lt;padel&gt;&quot;<\/b>/);
  assert.match(card.text, /• Start: Thu 18:00 → Thu 19:00/);
  assert.match(card.text, /⚠️ 3 players will be notified/);
  assert.deepEqual(
    card.keyboard!.inline_keyboard.map((row) => row.map((b) => ('callback_data' in b ? b.callback_data : ''))),
    [['agent:reject:act_1', 'agent:confirm:act_1'], ['agent:always:act_1']],
  );
  assert.deepEqual(parseAgentCallback('agent:confirm:act_1'), { kind: 'confirm', actionId: 'act_1' });
  assert.equal(await state.getBinding('run_1'), null, 'binding removed after the final render');
}

async function testFailureAndCancelNotes(): Promise<void> {
  {
    const { api, feeds, watcher, binding } = setup();
    const done = watcher.watch(binding);
    await settle();
    await feeds.emit('run_1', { type: 'run.failed', code: 'TIMEOUT', message: 'x' });
    await done;
    assert.match(api.edits(7).at(-1)!.text, /took too long/);
  }
  {
    // Phase 5: a run stopped mid-way by the daily budget says when it resets (user's zone).
    const { api, feeds, watcher, binding } = setup();
    const done = watcher.watch({ ...binding, timeZone: 'Europe/Belgrade' });
    await settle();
    await feeds.emit('run_1', { type: 'run.failed', code: 'BUDGET_EXCEEDED', message: null, retryAt: '2026-10-06T00:00:00.000Z' });
    await done;
    assert.match(api.edits(7).at(-1)!.text, /today’s assistant limit\. It resets at (\w+ )?02:00\./);
  }
  {
    const { api, feeds, watcher, binding } = setup();
    const done = watcher.watch({ ...binding, lang: 'ru' });
    await settle();
    await feeds.emit('run_1', { type: 'text.delta', text: 'Частичный ответ' });
    await feeds.emit('run_1', assistantSaved('m9', 'Частичный ответ'));
    await feeds.emit('run_1', { type: 'run.cancelled' });
    await done;
    const text = api.edits(7).at(-1)!.text;
    assert.match(text, /^Частичный ответ/);
    assert.match(text, /Остановлено/);
  }
}

async function testMissingRunNeverLeavesThinking(): Promise<void> {
  const { api, feeds, watcher, binding } = setup();
  feeds.missing.add('run_1');
  await watcher.watch(binding);
  assert.match(api.edits(7).at(-1)!.text, /Something went wrong/);
}

async function testLongAnswerIsSplit(): Promise<void> {
  const { api, feeds, watcher, binding } = setup();
  const done = watcher.watch(binding);
  await settle();
  const long = Array.from({ length: 30 }, (_, i) => `Paragraph ${i} ${'lorem ipsum '.repeat(30)}`).join('\n\n');
  await feeds.emit('run_1', assistantSaved('m1', long));
  await feeds.emit('run_1', { type: 'run.completed', status: 'COMPLETED', usage: { inputTokens: 0, outputTokens: 0 } });
  await done;
  const first = api.edits(7).at(-1)!;
  const rest = api.sends();
  assert.ok(rest.length >= 1, 'extra chunks sent as new messages');
  for (const message of [first, ...rest]) assert.ok(telegramHtmlTextLength(message.text) <= 4096);
  assert.equal(first.keyboard?.inline_keyboard.length ?? 0, 0, 'controls only under the last chunk');
  assert.ok(rest.at(-1)!.keyboard!.inline_keyboard.length > 0);
}

async function testDeletedStatusMessageFallsBackToNewMessage(): Promise<void> {
  const { api, feeds, watcher, binding } = setup();
  api.failEditsWith = { error_code: 400, description: 'Bad Request: message to edit not found' };
  const done = watcher.watch(binding);
  await settle();
  await feeds.emit('run_1', assistantSaved('m1', 'Answer'));
  await feeds.emit('run_1', { type: 'run.completed', status: 'COMPLETED', usage: { inputTokens: 0, outputTokens: 0 } });
  await done;
  assert.equal(api.sends().length, 1);
  assert.equal(api.sends()[0].text, 'Answer');
}

async function testRestartReattachesFromBindings(): Promise<void> {
  const { api, feeds, state, watcher, binding } = setup();
  await state.saveBinding(binding);
  // What the log (or the DB rebuild) holds for a run that finished while the bot was down.
  feeds.backlog.set('run_1', [
    { type: 'run.started', runId: 'run_1', chatId: 'chat_1' },
    assistantSaved('m1', 'Done while you were away'),
    { type: 'run.completed', status: 'COMPLETED', usage: { inputTokens: 0, outputTokens: 0 } },
  ]);
  assert.equal(await watcher.resumeAll(), 1);
  await settle(40);
  assert.equal(api.edits(7).at(-1)!.text, 'Done while you were away');
  assert.equal(await state.getBinding('run_1'), null);
  assert.equal(watcher.isWatching('run_1'), false);
}

function testReducerIgnoresDuplicatesAndPostTerminal(): void {
  let state = initialAgentBotRunState('run_1');
  const saved = assistantSaved('m1', 'Hi');
  for (const event of [saved, saved]) state = reduceAgentBotRun(state, event);
  assert.deepEqual(state.committed, ['Hi']);
  state = reduceAgentBotRun(state, { type: 'run.cancelled' });
  state = reduceAgentBotRun(state, { type: 'text.delta', text: 'late' });
  assert.equal(state.live, '');
  assert.equal(renderAgentBotStatus(initialAgentBotRunState('r'), 'xx').html, 'Queued (#1)'.replace(/^/, '⏳ '));
}

void (async () => {
  testReducerIgnoresDuplicatesAndPostTerminal();
  await testFullRunMapsToStatusEditsFinalAndCard();
  await testFailureAndCancelNotes();
  await testMissingRunNeverLeavesThinking();
  await testLongAnswerIsSplit();
  await testDeletedStatusMessageFallsBackToNewMessage();
  await testRestartReattachesFromBindings();
  console.log('agentBotRunWatcher.test.ts: ok');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
