/**
 * Slice 7j (booking plan §14.7) renders, pure + a fake-port callback: booking / slot lists
 * (club tz + tz label, never "free" for snapshot / app_only, HTML escaping, truncation with
 * an "Open in app" handoff), handoff URL buttons, the client-execution card (✖ Reject ·
 * 📱 Open in app, no ✅ / ♾), 409 CLIENT_EXECUTION_REQUIRED → handoff, UNKNOWN / partial.
 */
import assert from 'node:assert/strict';
import type { AgentEntityRef, AgentPendingActionDto } from '@bandeja/shared/agentContract';
import type { InlineKeyboardButton, InlineKeyboardMarkup } from 'grammy/types';
import { ApiError } from '../../../../utils/ApiError';
import { type AgentBotCtx, type AgentBotDeps, TelegramAgentBot } from '../agentBot';
import { AGENT_BOT_COPY_KEYS, AGENT_BOT_LANGUAGES, agentBotT } from '../agentBotCopy';
import { renderEntityTextBlock, timeZoneSuffix } from '../agentBotEntities';
import { AgentBotStateStore, MemoryAgentBotKv } from '../agentBotState';
import type { AgentBotRunWatcher } from '../agentBotRunWatcher';
import {
  actionOutcomeOf,
  callbackDataFits,
  initialAgentBotRunState,
  reduceAgentBotRun,
  renderAgentActionCard,
  renderAgentActionOutcome,
  renderAgentBotFinal,
} from '../agentBotView';

const LINKS = { frontendUrl: 'https://bandeja.me', inlineUrlButtons: true };
const LOCAL_LINKS = { frontendUrl: 'http://localhost:3001', inlineUrlButtons: false };

type Booking = Extract<AgentEntityRef, { type: 'booking' }>;
type Slot = Extract<AgentEntityRef, { type: 'slot' }>;

function booking(overrides: Partial<Booking> = {}): Booking {
  return {
    type: 'booking',
    ref: 'geb:b1',
    clubId: 'club_1',
    clubName: 'Padel <Arena> & Co',
    courtNames: ['Court 1', 'Court 2'],
    start: '2026-10-05T16:00:00.000Z',
    end: '2026-10-05T17:30:00.000Z',
    timeZone: 'Europe/Belgrade',
    provider: 'BOOKTIME',
    state: 'CONFIRMED',
    linkedGameIds: [],
    canCancel: true,
    ...overrides,
  };
}

function slot(overrides: Partial<Slot> = {}): Slot {
  return {
    type: 'slot',
    slotRef: 'sig.slot.1',
    clubId: 'club_1',
    clubName: 'Padel Arena',
    courtNames: ['Court 3'],
    start: '2026-10-05T16:00:00.000Z',
    end: '2026-10-05T17:30:00.000Z',
    timeZone: 'Europe/Belgrade',
    confidence: 'snapshot',
    asOf: '2026-10-05T12:05:00.000Z',
    ...overrides,
  };
}

function action(overrides: Partial<AgentPendingActionDto> = {}): AgentPendingActionDto {
  return {
    id: 'cmg1x2y3z0000abcdefghijkl',
    chatId: 'chat_1',
    runId: 'run_1',
    toolName: 'book_court',
    status: 'PENDING',
    preview: { title: 'Book <court>', lines: [{ label: 'Club', from: null, to: 'A & B' }], warnings: [] },
    expiresAt: '2026-09-30T10:15:00.000Z',
    result: null,
    createdAt: '2026-09-30T10:00:00.000Z',
    autoApproved: false,
    riskTier: 'critical',
    canAlwaysAllow: false,
    execution: 'server',
    ...overrides,
  };
}

function finalState(entities: AgentEntityRef[], extra: Partial<ReturnType<typeof initialAgentBotRunState>> = {}) {
  return {
    ...initialAgentBotRunState('run_1'),
    chatId: 'chat_1',
    committed: ['Here you go.'],
    entities,
    terminal: { kind: 'completed' as const, awaitingConfirmation: false },
    ...extra,
  };
}

function buttons(keyboard: InlineKeyboardMarkup | undefined): InlineKeyboardButton[] {
  return (keyboard?.inline_keyboard ?? []).flat();
}

function urlButtons(keyboard: InlineKeyboardMarkup | undefined): { text: string; url: string }[] {
  return buttons(keyboard).flatMap((b) => ('url' in b && b.url ? [{ text: b.text, url: b.url }] : []));
}

function testBookingLines(): void {
  const block = renderEntityTextBlock([booking()], 'en', { userTimeZone: 'Europe/Belgrade' });
  assert.match(block.html, /📅 <b>Padel &lt;Arena&gt; &amp; Co<\/b>/, 'club name escaped');
  assert.doesNotMatch(block.html, /<Arena>/);
  assert.match(block.html, /18:00–19:30/, 'club-local time (UTC+2 in October)');
  assert.doesNotMatch(block.html, /GMT/, 'no tz label when the user is in the same zone');
  assert.match(block.html, /Court 1, Court 2 · Booktime · Confirmed · can be cancelled/);

  const abroad = renderEntityTextBlock([booking()], 'en', { userTimeZone: 'Europe/London' });
  assert.match(abroad.html, /18:00–19:30 \(GMT\+2\)/, 'tz label when the club zone differs');
  const sameOffset = renderEntityTextBlock([booking()], 'en', { userTimeZone: 'Europe/Budapest' });
  assert.doesNotMatch(sameOffset.html, /GMT/, 'same offset → no label');
  const unknownUser = renderEntityTextBlock([booking()], 'en');
  assert.match(unknownUser.html, /\(GMT\+2\)/, 'unknown user zone → label');

  const cancelled = renderEntityTextBlock([booking({ state: 'CANCELLED', canCancel: true })], 'ru', {
    userTimeZone: 'Europe/Belgrade',
  });
  assert.match(cancelled.html, /Отменено/);
  assert.doesNotMatch(cancelled.html, /можно отменить/, 'cancellable only while CONFIRMED');
}

function testSlotsNeverFreeUnlessLive(): void {
  const block = renderEntityTextBlock(
    [
      slot(),
      slot({ slotRef: 's2', start: '2026-10-05T17:30:00.000Z', end: '2026-10-05T19:00:00.000Z' }),
      slot({ slotRef: 's3', confidence: 'app_only', asOf: null }),
      slot({ slotRef: 's4', confidence: 'snapshot', asOf: null, clubId: 'club_2', clubName: 'Other' }),
      slot({ slotRef: 's5', confidence: 'live', asOf: null, clubId: 'club_3', clubName: 'Live Club' }),
    ],
    'en',
    { userTimeZone: 'Europe/Belgrade' },
  );
  const groups = block.html.split('\n\n');
  assert.equal(groups.length, 4, 'grouped by club + date + confidence');
  assert.match(groups[0], /🕒 <b>Padel Arena<\/b>/);
  assert.match(groups[0], /• 18:00–19:30 · Court 3\n• 19:30–21:00 · Court 3/);
  assert.match(groups[0], /<i>No known conflicts as of 14:05<\/i>/, 'snapshot: as-of time in the club zone');
  assert.match(groups[1], /Open the club page to check live availability/, 'app_only');
  assert.match(groups[2], /No club booking data for this date/, 'snapshot without data');
  assert.match(groups[3], /Checked with the club booking system just now/, 'live');
  for (const group of groups.slice(0, 3)) assert.doesNotMatch(group, /\bfree\b|available now/i, 'never "free"');
  for (const lang of AGENT_BOT_LANGUAGES) {
    const localized = renderEntityTextBlock([slot()], lang).html;
    assert.doesNotMatch(localized, /\bfree\b/i, `${lang}: snapshot never "free"`);
  }
  assert.doesNotMatch(block.html, /sig\.slot/, 'slot refs never shown');
}

function testTruncationAndOpenInApp(): void {
  const many: AgentEntityRef[] = Array.from({ length: 30 }, (_, i) =>
    slot({ slotRef: `s${i}`, start: new Date(Date.UTC(2026, 9, 5, 6 + (i % 12), 0)).toISOString() }),
  );
  const block = renderEntityTextBlock(many, 'en');
  assert.equal(block.hidden, 18, '12 slots shown');
  assert.match(block.html, /…and 18 more/);

  const long: AgentEntityRef[] = Array.from({ length: 8 }, (_, i) =>
    booking({ ref: `geb:${i}`, clubName: 'X'.repeat(200), courtNames: Array.from({ length: 20 }, () => 'Court long name') }),
  );
  const capped = renderEntityTextBlock(long, 'en', { maxChars: 600 });
  assert.ok(capped.html.length <= 600, 'char cap');
  assert.ok(capped.hidden > 0);

  const finals = renderAgentBotFinal(finalState(many), 'en', LINKS, { userTimeZone: 'Europe/Belgrade' });
  const last = finals[finals.length - 1];
  for (const render of finals) assert.ok(render.html.length <= 4096);
  assert.deepEqual(urlButtons(last.keyboard), [{ text: '📱 Open in app', url: 'https://bandeja.me/ai/chat_1' }]);

  // A long answer: the list moves to its own message instead of overflowing.
  const longAnswer = finalState(many, { committed: ['word '.repeat(760).trim()] });
  const split = renderAgentBotFinal(longAnswer, 'en', LINKS);
  assert.equal(split.length, 2);
  for (const render of split) assert.ok(render.html.length <= 4096);
  assert.match(split[1].html, /…and 18 more/);
}

function testHandoffButtons(): void {
  const entities: AgentEntityRef[] = [
    { type: 'handoff', url: '/create-game?clubId=c1&bookingIds=b1', label: 'Create the game' },
    { type: 'handoff', url: 'javascript:alert(1)', label: 'bad' },
  ];
  const [final] = renderAgentBotFinal(finalState(entities), 'en', LINKS);
  assert.deepEqual(urlButtons(final.keyboard), [
    { text: '➡️ Create the game', url: 'https://bandeja.me/create-game?clubId=c1&bookingIds=b1' },
  ]);
  const [local] = renderAgentBotFinal(finalState(entities), 'en', LOCAL_LINKS);
  assert.equal(urlButtons(local.keyboard).length, 0, 'loopback: no URL buttons');
  assert.match(local.html, /<a href="http:\/\/localhost:3001\/create-game\?clubId=c1&amp;bookingIds=b1">/);

  // chatId comes from the event log.
  const reduced = reduceAgentBotRun(initialAgentBotRunState('run_9'), { type: 'run.started', runId: 'run_9', chatId: 'chat_9' });
  assert.equal(reduced.chatId, 'chat_9');
}

function testClientExecutionCard(): void {
  const card = renderAgentActionCard(action({ execution: 'client' }), 'en', LINKS);
  const all = buttons(card.keyboard);
  assert.deepEqual(
    all.map((b) => b.text),
    ['✖ Reject', '📱 Open in app'],
    'no Allow once / Always allow',
  );
  assert.equal('callback_data' in all[0] && all[0].callback_data, `agent:reject:${action().id}`);
  assert.ok(callbackDataFits(`agent:reject:${action().id}`));
  assert.deepEqual(urlButtons(card.keyboard), [{ text: '📱 Open in app', url: 'https://bandeja.me/ai/chat_1' }]);
  assert.match(card.html, /Book &lt;court&gt;/);
  assert.match(card.html, /runs in the app/);

  const local = renderAgentActionCard(action({ execution: 'client' }), 'en', LOCAL_LINKS);
  assert.deepEqual(buttons(local.keyboard).map((b) => b.text), ['✖ Reject']);
  assert.match(local.html, /<a href="http:\/\/localhost:3001\/ai\/chat_1">📱 Open in app<\/a>/);

  const server = renderAgentActionCard(action(), 'en', LINKS);
  assert.deepEqual(buttons(server.keyboard).map((b) => b.text), ['✖ Reject', '✅ Allow once']);
}

function testUnknownAndPartialOutcomes(): void {
  assert.equal(actionOutcomeOf('UNKNOWN'), 'unknown');
  const unknown = renderAgentActionOutcome(
    action({ status: 'UNKNOWN', result: { ok: false, message: null } }),
    'en',
    'unknown',
    { links: LINKS },
  );
  assert.match(unknown.html, /⚠️ Result unknown — check Connected clubs/);
  assert.deepEqual(urlButtons(unknown.keyboard), [
    { text: '🔌 Connected clubs', url: 'https://bandeja.me/profile/connected-clubs' },
  ]);

  const partial = renderAgentActionOutcome(
    action({
      status: 'EXECUTED',
      result: {
        ok: true,
        partial: true,
        message: '2 of 3 courts booked <b>',
        entities: [{ type: 'handoff', url: '/create-game?bookingIds=b1,b2', label: 'Create the game' }],
      },
    }),
    'en',
    'confirmed',
    { links: LINKS },
  );
  assert.match(partial.html, /⚠️ Partly done<\/b>\n2 of 3 courts booked &lt;b&gt;/);
  assert.doesNotMatch(partial.html, /✅ Confirmed/);
  assert.deepEqual(urlButtons(partial.keyboard), [
    { text: '➡️ Create the game', url: 'https://bandeja.me/create-game?bookingIds=b1,b2' },
  ]);

  const [final] = renderAgentBotFinal(
    finalState([], {
      actions: [
        action({
          toolName: 'invite_players',
          status: 'EXECUTED',
          autoApproved: true,
          result: { ok: true, partial: true, message: 'Bookings cancelled, game still exists' },
        }),
      ],
    }),
    'en',
    LINKS,
  );
  assert.match(final.html, /⚠️ Partly done<\/b> Bookings cancelled, game still exists/);
}

async function testConfirm409HandsOff(): Promise<void> {
  const calls: string[] = [];
  const deps: AgentBotDeps = {
    resolveUser: async (telegramId) => (telegramId === '111' ? { id: 'user_a', isAdmin: false, language: 'en' } : null),
    sendMessage: async () => ({ runId: 'r' }),
    cancelRun: async () => {},
    actions: {
      confirm: async (userId, actionId) => {
        calls.push(`confirm:${userId}:${actionId}`);
        throw new ApiError(409, 'Open the app to confirm this change', true, { code: 'CLIENT_EXECUTION_REQUIRED' });
      },
      reject: async () => {
        throw new ApiError(404, 'x');
      },
      chatIdOf: async (userId, actionId) => {
        calls.push(`chatIdOf:${userId}:${actionId}`);
        return userId === 'user_a' ? 'chat_1' : null;
      },
    },
    permissions: { list: async () => [], set: async () => ({}) as never, resetAll: async () => [] },
    chats: {
      ensureCurrent: async () => ({ id: 'c', title: null }),
      startNew: async () => ({ id: 'c' }),
      list: async () => [],
      switchTo: async () => ({ title: null, exchange: { user: null, assistant: null } }),
    },
    state: new AgentBotStateStore(new MemoryAgentBotKv()),
    watcher: { watch: async () => {} } as unknown as AgentBotRunWatcher,
    languageFor: (user, code) => user?.language ?? code ?? 'en',
    replyLoginLink: async () => {},
    links: LINKS,
  };
  const bot = new TelegramAgentBot(deps);
  const answers: { text?: string; show_alert?: boolean }[] = [];
  const markups: InlineKeyboardMarkup[] = [];
  const edits: string[] = [];
  const ctx: AgentBotCtx = {
    from: { id: 111, language_code: 'en' },
    chat: { id: 111, type: 'private' },
    callbackQuery: { data: 'agent:confirm:act_1', message: { message_id: 55 } },
    api: {
      sendMessage: async () => ({ message_id: 1 }),
      editMessageText: async (_c, _m, text) => {
        edits.push(text);
        return true;
      },
      editMessageReplyMarkup: async (_c, _m, other) => {
        if (other.reply_markup) markups.push(other.reply_markup);
        return true;
      },
    },
    answerCallbackQuery: async (other) => {
      answers.push(other ?? {});
      return true;
    },
  };
  await bot.handleCallback(ctx);
  assert.deepEqual(calls, ['confirm:user_a:act_1', 'chatIdOf:user_a:act_1']);
  assert.equal(answers[0].text, agentBotT('action.clientRequired', 'en'));
  assert.equal(answers[0].show_alert, true);
  assert.notEqual(answers[0].text, agentBotT('action.gone', 'en'), 'not the generic 409 error');
  assert.equal(edits.length, 0);
  assert.equal(markups.length, 1);
  assert.deepEqual(
    markups[0].inline_keyboard.flat().map((b) => ('url' in b ? `${b.text}|${b.url}` : `${b.text}|${'callback_data' in b ? b.callback_data : ''}`)),
    ['✖ Reject|agent:reject:act_1', '📱 Open in app|https://bandeja.me/ai/chat_1'],
  );
}

function testCopyParity(): void {
  const newKeys = AGENT_BOT_COPY_KEYS.filter((k) => /^(booking\.|entity\.|button\.openInApp|button\.connectedClubs|action\.(client|unknown|partial))/.test(k));
  assert.equal(newKeys.length, 12);
  for (const key of newKeys) {
    for (const lang of AGENT_BOT_LANGUAGES) {
      const text = agentBotT(key, lang);
      assert.ok(text && text !== key, `${lang} ${key}`);
    }
  }
  assert.equal(timeZoneSuffix('2026-01-05T10:00:00.000Z', 'Not/AZone', null), '', 'invalid zone → no label');
}

void (async () => {
  testBookingLines();
  testSlotsNeverFreeUnlessLive();
  testTruncationAndOpenInApp();
  testHandoffButtons();
  testClientExecutionCard();
  testUnknownAndPartialOutcomes();
  await testConfirm409HandsOff();
  testCopyParity();
  console.log('agentBotBooking.test.ts: ok');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
