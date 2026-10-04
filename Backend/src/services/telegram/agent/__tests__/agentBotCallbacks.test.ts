/**
 * Callback authorization + chat switching for the Telegram assistant, with fake ports:
 * identity always comes from `ctx.from.id`, never the payload; another user's action / run /
 * chat id behaves as missing (404 → a "no longer available" toast, nothing edited).
 */
import assert from 'node:assert/strict';
import type { AgentPendingActionDto, AgentToolPermissionDto } from '@bandeja/shared/agentContract';
import type { InlineKeyboardMarkup } from 'grammy/types';
import { ApiError } from '../../../../utils/ApiError';
import { type AgentBotCtx, type AgentBotDeps, type AgentBotUser, TelegramAgentBot, sendErrorText } from '../agentBot';
import { lastExchange, paginateChats, pickCurrentChat, renderChatsPage } from '../agentBotChatList';
import type { AgentBotRunBinding } from '../agentBotState';
import { AgentBotStateStore, MemoryAgentBotKv } from '../agentBotState';
import type { AgentBotRunWatcher } from '../agentBotRunWatcher';

const USER_A: AgentBotUser = { id: 'user_a', isAdmin: false, language: 'en' };
const USER_B: AgentBotUser = { id: 'user_b', isAdmin: false, language: 'ru' };
const TELEGRAM_USERS: Record<string, AgentBotUser> = { '111': USER_A, '222': USER_B };

function action(status: AgentPendingActionDto['status'], id = 'act_a'): AgentPendingActionDto {
  return {
    id,
    chatId: 'chat_a',
    runId: 'run_a',
    toolName: 'update_game',
    status,
    preview: { title: 'Change game', lines: [], warnings: [] },
    expiresAt: '2026-09-30T10:15:00.000Z',
    result: status === 'EXECUTED' ? { ok: true, message: 'Moved to 19:00' } : null,
    createdAt: '2026-09-30T10:00:00.000Z',
    autoApproved: false,
    riskTier: 'standard',
    canAlwaysAllow: true,
    execution: 'server',
  };
}

const notFound = () => new ApiError(404, 'Action not found');

function permTool(toolName: string, name: string, critical = false): AgentToolPermissionDto {
  return {
    toolName,
    name,
    description: '',
    riskTier: critical ? 'critical' : 'standard',
    mode: 'ASK',
    canAlwaysAllow: !critical,
  };
}

function harness(options: { actionOwner?: string; confirmError?: ApiError } = {}) {
  const calls: string[] = [];
  /** Per-user stored permissions (the fake permission service). */
  const perms: Record<string, AgentToolPermissionDto[]> = {
    user_a: [permTool('invite_players', 'Invite players'), permTool('remove_participant', 'Remove players', true)],
    user_b: [permTool('invite_players', 'Invite players')],
  };
  const watched: AgentBotRunBinding[] = [];
  const loginLinks: string[] = [];
  const state = new AgentBotStateStore(new MemoryAgentBotKv());
  const chats = [
    { id: 'chat_old', title: 'Old', updatedAt: '2026-09-01T10:00:00.000Z', userId: 'user_a' },
    { id: 'chat_new', title: 'New', updatedAt: '2026-09-29T10:00:00.000Z', userId: 'user_a' },
    { id: 'chat_b', title: 'B', updatedAt: '2026-09-30T10:00:00.000Z', userId: 'user_b' },
  ];
  const deps: AgentBotDeps = {
    resolveUser: async (telegramId) => TELEGRAM_USERS[telegramId] ?? null,
    sendMessage: async ({ user, chatId, text }) => {
      calls.push(`send:${user.id}:${chatId}:${text}`);
      return { runId: 'run_new' };
    },
    cancelRun: async (userId, runId) => {
      calls.push(`cancel:${userId}:${runId}`);
      if (runId !== 'run_a' || userId !== 'user_a') throw new ApiError(404, 'Run not found');
    },
    actions: {
      confirm: async (userId, actionId, _locale, confirmOptions) => {
        calls.push(`confirm:${userId}:${actionId}${confirmOptions?.remember ? `:remember=${confirmOptions.remember}` : ''}`);
        if (options.confirmError) throw options.confirmError;
        if (userId !== (options.actionOwner ?? 'user_a')) throw notFound();
        const remembered = confirmOptions?.remember === 'always';
        return { action: action('EXECUTED', actionId), runId: 'run_follow', remembered };
      },
      reject: async (userId, actionId) => {
        calls.push(`reject:${userId}:${actionId}`);
        if (userId !== (options.actionOwner ?? 'user_a')) throw notFound();
        return { action: action('REJECTED', actionId), runId: null };
      },
    },
    permissions: {
      list: async (user) => {
        calls.push(`perms:list:${user.id}`);
        return (perms[user.id] ?? []).map((t) => ({ ...t }));
      },
      set: async (user, toolName, mode) => {
        calls.push(`perms:set:${user.id}:${toolName}:${mode}`);
        const tool = perms[user.id]?.find((t) => t.toolName === toolName);
        if (!tool) throw new ApiError(404, 'Tool not found');
        if (mode === 'ALWAYS_ALLOW' && !tool.canAlwaysAllow) {
          throw new ApiError(400, 'critical', true, { code: 'PERMISSION_NOT_ALLOWED' });
        }
        tool.mode = mode;
        return { ...tool };
      },
      resetAll: async (user) => {
        calls.push(`perms:reset:${user.id}`);
        for (const tool of perms[user.id] ?? []) tool.mode = 'ASK';
        return (perms[user.id] ?? []).map((t) => ({ ...t }));
      },
    },
    chats: {
      ensureCurrent: async (userId) => {
        const mine = chats.filter((c) => c.userId === userId);
        const current = pickCurrentChat(mine);
        return current ? { id: current.id, title: current.title } : { id: 'created', title: null };
      },
      startNew: async (userId) => {
        calls.push(`new:${userId}`);
        return { id: 'fresh' };
      },
      list: async (userId) => chats.filter((c) => c.userId === userId),
      switchTo: async (userId, chatId) => {
        const chat = chats.find((c) => c.id === chatId && c.userId === userId);
        if (!chat) throw new ApiError(404, 'Chat not found');
        chat.updatedAt = '2026-09-30T12:00:00.000Z';
        calls.push(`switch:${userId}:${chatId}`);
        return { title: chat.title, exchange: { user: 'When do I play?', assistant: 'On **Thursday**.' } };
      },
    },
    state,
    watcher: { watch: async (binding: AgentBotRunBinding) => void watched.push(binding) } as unknown as AgentBotRunWatcher,
    languageFor: (user, code) => user?.language ?? code ?? 'en',
    replyLoginLink: async (ctx) => void loginLinks.push(String(ctx.from?.id)),
    now: () => 1,
  };
  return { bot: new TelegramAgentBot(deps), calls, watched, loginLinks, state, chats, perms };
}

type Recorded = { answers: { text?: string; show_alert?: boolean }[]; sends: string[]; edits: { id: number; text: string; keyboard?: InlineKeyboardMarkup }[] };

function ctxFor(
  telegramId: number,
  data: string,
  options: { chatType?: string; messageId?: number } = {},
): { ctx: AgentBotCtx; rec: Recorded } {
  const rec: Recorded = { answers: [], sends: [], edits: [] };
  let nextId = 900;
  const ctx: AgentBotCtx = {
    from: { id: telegramId, language_code: 'en' },
    chat: { id: telegramId, type: options.chatType ?? 'private' },
    callbackQuery: { data, message: { message_id: options.messageId ?? 55 } },
    api: {
      sendMessage: async (_chatId, text) => {
        rec.sends.push(text);
        return { message_id: nextId++ };
      },
      editMessageText: async (_chatId, messageId, text, other) => {
        rec.edits.push({ id: messageId, text, keyboard: other.reply_markup });
        return true;
      },
      editMessageReplyMarkup: async () => true,
    },
    answerCallbackQuery: async (other) => {
      rec.answers.push(other ?? {});
      return true;
    },
  };
  return { ctx, rec };
}

async function testOwnerConfirmRunsServiceAndFollowUp(): Promise<void> {
  const h = harness();
  const { ctx, rec } = ctxFor(111, 'agent:confirm:act_a');
  await h.bot.handleCallback(ctx);
  assert.deepEqual(h.calls, ['confirm:user_a:act_a'], 'principal comes from ctx.from (111 → user_a)');
  assert.equal(rec.edits.length, 1, 'card edited to its outcome');
  assert.match(rec.edits[0].text, /✅ Confirmed/);
  assert.match(rec.edits[0].text, /Moved to 19:00/);
  assert.deepEqual(rec.edits[0].keyboard, { inline_keyboard: [] }, 'buttons removed');
  assert.equal(h.watched.length, 1, 'follow-up run is streamed');
  assert.equal(h.watched[0].runId, 'run_follow');
  assert.equal(h.watched[0].userId, 'user_a');
}

async function testOtherUserPressingTheButtonIsNoOp(): Promise<void> {
  const h = harness();
  const { ctx, rec } = ctxFor(222, 'agent:confirm:act_a');
  await h.bot.handleCallback(ctx);
  assert.deepEqual(h.calls, ['confirm:user_b:act_a'], 'the service is asked as user_b, never user_a');
  assert.equal(rec.edits.length, 0, 'nothing edited');
  assert.equal(rec.sends.length, 0, 'nothing sent');
  assert.equal(h.watched.length, 0);
  assert.equal(rec.answers.length, 1);
  assert.equal(rec.answers[0].text, 'Больше недоступно', 'same toast as a missing id (user_b is ru)');

  const reject = ctxFor(222, 'agent:reject:act_a');
  await h.bot.handleCallback(reject.ctx);
  assert.equal(reject.rec.edits.length, 0);

  const stop = ctxFor(222, 'agent:stop:run_a');
  await h.bot.handleCallback(stop.ctx);
  assert.ok(h.calls.includes('cancel:user_b:run_a'));
  assert.equal(stop.rec.answers[0].text, 'Больше недоступно');
}

async function testUnlinkedGroupAndMalformedNeverReachServices(): Promise<void> {
  const h = harness();
  const unlinked = ctxFor(333, 'agent:confirm:act_a');
  await h.bot.handleCallback(unlinked.ctx);
  assert.deepEqual(h.loginLinks, ['333'], 'unlinked users get the login flow');
  assert.equal(unlinked.rec.answers[0].show_alert, true);

  const group = ctxFor(111, 'agent:confirm:act_a', { chatType: 'supergroup' });
  await h.bot.handleCallback(group.ctx);

  for (const data of ['agent:confirm:../x', 'agent:confirm:', 'agent:confirm:a:b', 'agent:nope', 'agent:chats:-1']) {
    await h.bot.handleCallback(ctxFor(111, data).ctx);
  }
  assert.deepEqual(h.calls, [], 'no service call for any of these');
}

async function testRejectAndConflicts(): Promise<void> {
  const h = harness();
  const reject = ctxFor(111, 'agent:reject:act_a');
  await h.bot.handleCallback(reject.ctx);
  assert.match(reject.rec.edits[0].text, /✖ Cancelled/);
  assert.equal(h.watched.length, 0, 'no follow-up run after reject');

  const expired = harness({ confirmError: new ApiError(409, 'expired', true, { code: 'ACTION_EXPIRED' }) });
  const conflict = ctxFor(111, 'agent:confirm:act_a');
  await expired.bot.handleCallback(conflict.ctx);
  assert.equal(conflict.rec.answers[0].show_alert, true);
  assert.equal(conflict.rec.answers[0].text, 'This action is no longer available.');

  const notYet = harness({ confirmError: new ApiError(501, 'x', true, { code: 'NOT_IMPLEMENTED' }) });
  const stub = ctxFor(111, 'agent:confirm:act_a');
  await notYet.bot.handleCallback(stub.ctx);
  assert.match(stub.rec.answers[0].text ?? '', /isn’t available yet/);
}

async function testChatSwitching(): Promise<void> {
  const h = harness();
  const list = ctxFor(111, 'agent:list');
  await h.bot.handleCallback(list.ctx);
  assert.equal(list.rec.sends.length, 1, '"Chats" under an answer sends a new list message');
  assert.match(list.rec.sends[0], /Your chats \(1\/1\)/);

  const foreign = ctxFor(111, 'agent:sw:chat_b');
  await h.bot.handleCallback(foreign.ctx);
  assert.equal(foreign.rec.edits.length, 0, "another user's chat id is a no-op");
  assert.equal(foreign.rec.answers[0].text, 'No longer available');

  const own = ctxFor(111, 'agent:sw:chat_old', { messageId: 77 });
  await h.bot.handleCallback(own.ctx);
  assert.ok(h.calls.includes('switch:user_a:chat_old'));
  assert.equal(own.rec.edits[0].id, 77, 'the list message turns into the switched view');
  assert.match(own.rec.edits[0].text, /Switched to “Old”/);
  assert.match(own.rec.edits[0].text, /On <b>Thursday<\/b>\./);
  assert.equal(await h.state.isAssistantMode('111'), true, 'switching enters assistant mode');

  // The switched chat is now current: the next question goes there.
  const question = { ...ctxFor(111, '').ctx, callbackQuery: undefined, message: { text: 'hi', message_id: 1 } };
  assert.equal(await h.bot.handleText(question, { text: 'hi' }), true);
  assert.ok(h.calls.includes('send:user_a:chat_old:hi'));
  assert.equal(h.watched.at(-1)?.runId, 'run_new');

  // Exit: plain text is no longer the assistant's.
  await h.bot.handleCallback(ctxFor(111, 'agent:exit').ctx);
  assert.equal(await h.bot.handleText(question, { text: 'hi again' }), false);
  // Commands are never swallowed.
  await h.state.enterAssistantMode('111');
  assert.equal(await h.bot.handleText(question, { text: '/play' }), false);
}

function testChatListPaging(): void {
  const chats = Array.from({ length: 50 }, (_, i) => ({
    id: `c${i}`,
    title: i === 3 ? null : `Chat ${i}`,
    updatedAt: new Date(Date.UTC(2026, 8, 1, 0, i)).toISOString(),
  }));
  const first = paginateChats(chats, 0, 'en');
  assert.equal(first.pages, 5, 'capped at 5 pages of 8');
  assert.equal(first.rows.length, 8);
  assert.equal(first.rows[0].chatId, 'c49', 'newest first');
  assert.equal(first.rows[0].current, true);
  assert.equal(first.rows[0].label, '● Chat 49');
  const clamped = paginateChats(chats, 99, 'en');
  assert.equal(clamped.page, 4);
  const render = renderChatsPage(paginateChats(chats, 1, 'en'), 'en');
  const data = render.keyboard.inline_keyboard.flat().map((b) => ('callback_data' in b ? b.callback_data : ''));
  assert.ok(data.includes('agent:sw:c41'));
  assert.ok(data.includes('agent:chats:0') && data.includes('agent:chats:2'), 'pager both ways');
  assert.equal(pickCurrentChat(chats)?.id, 'c49');
  assert.equal(paginateChats([], 0, 'en').rows.length, 0);
  assert.match(renderChatsPage(paginateChats([], 0, 'en'), 'en').html, /No chats yet/);
  const untitled = paginateChats([{ id: 'x', title: null, updatedAt: '2026-01-01T00:00:00Z' }], 0, 'en');
  assert.equal(untitled.rows[0].label, '● New chat');
}

function testLastExchange(): void {
  assert.deepEqual(lastExchange([]), { user: null, assistant: null });
  assert.deepEqual(
    lastExchange([
      { role: 'USER', blocks: [{ type: 'text', text: 'first' }] },
      { role: 'ASSISTANT', blocks: [{ type: 'text', text: 'one' }] },
      { role: 'USER', blocks: [{ type: 'text', text: 'second' }] },
      { role: 'ASSISTANT', blocks: [{ type: 'text', text: 'Let me check' }, { type: 'tool_call', callId: 'c', name: 'n', label: 'l' }] },
      { role: 'TOOL', blocks: [{ type: 'tool_result', callId: 'c', ok: true, summary: 's' }] },
      { role: 'ASSISTANT', blocks: [{ type: 'text', text: 'two' }] },
    ]),
    { user: 'second', assistant: 'Let me check\n\ntwo' },
  );
}

function testSendErrorMapping(): void {
  const err = (status: number, code?: string) => new ApiError(status, 'x', true, code ? { code } : undefined);
  assert.match(sendErrorText(err(409, 'CHAT_BUSY'), 'en'), /still answering/);
  assert.match(sendErrorText(err(429, 'RATE_LIMITED'), 'en'), /Too many messages/);
  assert.match(sendErrorText(err(429, 'BUDGET_EXCEEDED'), 'en'), /today’s assistant limit. Try again tomorrow/, 'no retryAt: generic line');
  // Phase 5: the reset time (next UTC midnight) in the user's zone.
  const budget = new ApiError(429, 'x', true, { code: 'BUDGET_EXCEEDED', retryAt: '2026-10-06T00:00:00.000Z' });
  const now = new Date('2026-10-05T10:00:00Z');
  assert.equal(sendErrorText(budget, 'en', { timeZone: 'America/New_York', now }), 'You’ve reached today’s assistant limit. It resets at 20:00.');
  assert.equal(sendErrorText(budget, 'en', { timeZone: 'Europe/Belgrade', now }), 'You’ve reached today’s assistant limit. It resets at Tue 02:00.');
  assert.equal(sendErrorText(budget, 'en', { timeZone: null, now }), 'You’ve reached today’s assistant limit. It resets at Tue 00:00 UTC.');
  assert.equal(sendErrorText(budget, 'en', { timeZone: 'Not/AZone', now }), 'You’ve reached today’s assistant limit. It resets at Tue 00:00 UTC.');
  assert.match(sendErrorText(budget, 'ru', { timeZone: 'Europe/Belgrade', now }), /^Дневной лимит ассистента исчерпан\. Он обновится в .*02:00\.$/);
  assert.match(sendErrorText(err(503, 'LLM_ERROR'), 'en'), /unavailable/);
  assert.match(sendErrorText(err(400), 'en'), /too long/);
  assert.match(sendErrorText(new Error('boom'), 'en'), /Something went wrong/);
}

async function testAlwaysAllowSendsRemember(): Promise<void> {
  const h = harness();
  const { ctx, rec } = ctxFor(111, 'agent:always:act_a');
  await h.bot.handleCallback(ctx);
  assert.deepEqual(h.calls, ['confirm:user_a:act_a:remember=always'], 'always allow = confirm with remember');
  assert.equal(rec.edits.length, 1);
  assert.match(rec.edits[0].text, /✅ Confirmed/);
  assert.match(rec.edits[0].text, /From now on “Edit games” runs without asking/, 'localized tool name');
  assert.deepEqual(rec.edits[0].keyboard, { inline_keyboard: [] });
  assert.equal(h.watched[0]?.runId, 'run_follow');

  const once = harness();
  const plain = ctxFor(111, 'agent:confirm:act_a');
  await once.bot.handleCallback(plain.ctx);
  assert.deepEqual(once.calls, ['confirm:user_a:act_a'], 'Allow once never remembers');
  assert.doesNotMatch(plain.rec.edits[0].text, /From now on/);

  const critical = harness({ confirmError: new ApiError(400, 'critical', true, { code: 'PERMISSION_NOT_ALLOWED' }) });
  const refused = ctxFor(111, 'agent:always:act_a');
  await critical.bot.handleCallback(refused.ctx);
  assert.equal(refused.rec.answers[0].show_alert, true, 'PERMISSION_NOT_ALLOWED → alert');
  assert.match(refused.rec.answers[0].text ?? '', /always needs your confirmation/);
  assert.equal(refused.rec.edits.length, 0, 'card kept so Allow once still works');
  assert.equal(critical.watched.length, 0);
}

async function testOtherUserAlwaysAndPermIsNoOp(): Promise<void> {
  const h = harness();
  const always = ctxFor(222, 'agent:always:act_a');
  await h.bot.handleCallback(always.ctx);
  assert.deepEqual(h.calls, ['confirm:user_b:act_a:remember=always'], 'asked as the tapping user');
  assert.equal(always.rec.edits.length, 0);
  assert.equal(always.rec.answers[0].text, 'Больше недоступно');
  assert.equal(h.watched.length, 0);

  // user_b does not have remove_participant: no write, nothing about user_a changes.
  const perm = ctxFor(222, 'agent:perm:remove_participant');
  await h.bot.handleCallback(perm.ctx);
  assert.ok(!h.calls.some((c) => c.startsWith('perms:set')), 'no permission stored');
  assert.equal(perm.rec.answers[0].text, 'Больше недоступно');
  assert.ok(h.perms.user_a.every((t) => t.mode === 'ASK'), "user_a's permissions untouched");
}

function buttonTexts(keyboard: InlineKeyboardMarkup | undefined): string[] {
  return (keyboard?.inline_keyboard ?? []).flat().map((b) => b.text);
}

async function testPermissionsMenuToggleAndReset(): Promise<void> {
  const h = harness();
  const open = ctxFor(111, 'agent:perms');
  await h.bot.handleCallback(open.ctx);
  assert.equal(open.rec.sends.length, 1, 'menu sent as a new message');
  assert.match(open.rec.sends[0], /Assistant permissions/);

  const toggle = ctxFor(111, 'agent:perm:invite_players');
  await h.bot.handleCallback(toggle.ctx);
  assert.ok(h.calls.includes('perms:set:user_a:invite_players:ALWAYS_ALLOW'));
  assert.equal(toggle.rec.edits.length, 1, 'menu edited in place');
  assert.equal(toggle.rec.edits[0].id, 55);
  assert.ok(buttonTexts(toggle.rec.edits[0].keyboard).includes('♾ Invite players · Always allow'));
  assert.ok(buttonTexts(toggle.rec.edits[0].keyboard).includes('🔒 Remove players · always asks'));
  assert.match(toggle.rec.answers[0].text ?? '', /Invite players: always allow/);

  const back = ctxFor(111, 'agent:permi:0');
  await h.bot.handleCallback(back.ctx);
  assert.ok(h.calls.includes('perms:set:user_a:invite_players:ASK'), 'index form resolves server-side');
  assert.ok(buttonTexts(back.rec.edits[0].keyboard).includes('❔ Invite players · Ask'));

  const critical = ctxFor(111, 'agent:perm:remove_participant');
  await h.bot.handleCallback(critical.ctx);
  assert.ok(!h.calls.some((c) => c.includes('remove_participant')), 'critical tool: set never called');
  assert.equal(critical.rec.answers[0].show_alert, true);
  assert.match(critical.rec.answers[0].text ?? '', /always asks for confirmation/);
  assert.equal(critical.rec.edits.length, 0);

  h.perms.user_a[0].mode = 'ALWAYS_ALLOW';
  const ask = ctxFor(111, 'agent:preset');
  await h.bot.handleCallback(ask.ctx);
  assert.ok(!h.calls.includes('perms:reset:user_a'), 'reset asks first');
  assert.match(ask.rec.edits[0].text, /Reset all tools to Ask\?/);
  assert.deepEqual(
    ask.rec.edits[0].keyboard?.inline_keyboard.flat().map((b) => ('callback_data' in b ? b.callback_data : '')),
    ['agent:perms:edit', 'agent:preset:yes'],
  );
  const cancel = ctxFor(111, 'agent:perms:edit');
  await h.bot.handleCallback(cancel.ctx);
  assert.match(cancel.rec.edits[0].text, /Assistant permissions/, 'Back edits the menu in place');
  assert.equal(cancel.rec.sends.length, 0);

  const yes = ctxFor(111, 'agent:preset:yes');
  await h.bot.handleCallback(yes.ctx);
  assert.ok(h.calls.includes('perms:reset:user_a'));
  assert.ok(buttonTexts(yes.rec.edits[0].keyboard).includes('❔ Invite players · Ask'));
  assert.equal(h.perms.user_b[0].mode, 'ASK');
}

async function testAiPermissionsSubcommand(): Promise<void> {
  const h = harness();
  const { ctx, rec } = ctxFor(111, '');
  delete ctx.callbackQuery;
  ctx.match = 'Permissions';
  await h.bot.handleAiCommand(ctx);
  assert.equal(rec.sends.length, 1);
  assert.match(rec.sends[0], /Assistant permissions/);
  assert.ok(!h.calls.some((c) => c.startsWith('send:')), 'not sent to the model');
}

void (async () => {
  testChatListPaging();
  testLastExchange();
  testSendErrorMapping();
  await testOwnerConfirmRunsServiceAndFollowUp();
  await testOtherUserPressingTheButtonIsNoOp();
  await testUnlinkedGroupAndMalformedNeverReachServices();
  await testRejectAndConflicts();
  await testChatSwitching();
  await testAlwaysAllowSendsRemember();
  await testOtherUserAlwaysAndPermIsNoOp();
  await testPermissionsMenuToggleAndReset();
  await testAiPermissionsSubcommand();
  console.log('agentBotCallbacks.test.ts: ok');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
