/**
 * Pure mapping from agent run events (`AgentStreamEvent`, the same log the app's SSE reads)
 * to what the Telegram assistant shows:
 *   - one **status message** per run, edited as the run progresses: "⏳ Queued (#n)" →
 *     "🤔 Thinking…" → tool step labels ("🔎 Looking up your games…") → the streamed answer,
 *     with a ⏹ Stop button while the run is live;
 *   - on the terminal event, the **final answer** (status message replaced by the first
 *     chunk, more chunks as new messages), game links as URL buttons, and the controls row;
 *   - one **confirmation card** per pending action (server-rendered preview, ✖ Reject /
 *     ✅ Allow once / ♾ Always allow buttons: `agent:reject:<id>` / `agent:confirm:<id>` /
 *     `agent:always:<id>`; Always allow only when `canAlwaysAllow`);
 *     client-executed actions get ✖ Reject / 📱 Open in app instead (booking plan §14.5);
 *   - booking / slot lists as escaped text (`agentBotEntities.ts`), handoff / game links as
 *     URL buttons, UNKNOWN / partial action outcomes (slice 7j);
 *   - a "Done automatically" line per auto-approved write in the final answer;
 *   - a "🧠 Saved to memory: …" line per `memory.saved` (Phase 11; Undo lives in the app);
 *   - the 🔐 Permissions menu (`agent:perms`, `agent:perm:<tool>`, `agent:preset[:yes]`).
 * No I/O here; `agentBotRunWatcher.ts` drives the Telegram API.
 */
import {
  agentEntityKey,
  type AgentEntityRef,
  type AgentPendingActionDto,
  type AgentStreamEvent,
} from '@bandeja/shared/agentContract';
import type { InlineKeyboardButton, InlineKeyboardMarkup } from 'grammy/types';
import { agentToolPermissionText } from '../../agent/i18n/agentToolPermissionI18n';
import { agentBotT } from './agentBotCopy';
import { renderEntityTextBlock } from './agentBotEntities';
import {
  TELEGRAM_MESSAGE_MAX,
  agentAnswerToTelegramMessages,
  agentMarkdownToTelegramHtml,
  escapeTelegramHtml,
  tailForPreview,
} from './agentTelegramHtml';
import { telegramHtmlTextLength } from '../shared/telegramMarkdown';
import type { TelegramMessageRender } from './telegramEditThrottler';

export type AgentBotTerminal =
  | { kind: 'completed'; awaitingConfirmation: boolean }
  | { kind: 'failed'; code: string }
  | { kind: 'cancelled' };

export type AgentBotRunState = {
  runId: string;
  /** From `run.queued` / `run.started` / `message.saved`; the "Open in app" link target. */
  chatId: string | null;
  phase: 'queued' | 'thinking' | 'tool' | 'writing';
  queuePosition: number | null;
  toolLabel: string | null;
  /** Assistant texts already saved (`message.saved`), in order. */
  committed: string[];
  savedMessageIds: string[];
  /** Streamed text of the current step, not saved yet. */
  live: string;
  entities: AgentEntityRef[];
  actions: AgentPendingActionDto[];
  /** `memory.saved` descriptions (Phase 11), one final-answer line each. */
  memorySaved: string[];
  terminal: AgentBotTerminal | null;
};

export function initialAgentBotRunState(runId: string): AgentBotRunState {
  return {
    runId,
    chatId: null,
    phase: 'queued',
    queuePosition: null,
    toolLabel: null,
    committed: [],
    savedMessageIds: [],
    live: '',
    entities: [],
    actions: [],
    memorySaved: [],
    terminal: null,
  };
}

function addEntities(state: AgentBotRunState, entities: AgentEntityRef[] | undefined): AgentEntityRef[] {
  if (!entities?.length) return state.entities;
  const seen = new Set(state.entities.map(agentEntityKey));
  const next = [...state.entities];
  for (const entity of entities) {
    const key = agentEntityKey(entity);
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(entity);
  }
  return next;
}

/** Reducer. Replays (the full log, or the DB-rebuilt one) give the same result. */
export function reduceAgentBotRun(state: AgentBotRunState, event: AgentStreamEvent): AgentBotRunState {
  if (state.terminal) return state;
  switch (event.type) {
    case 'run.queued':
      return { ...state, chatId: event.chatId ?? state.chatId, phase: 'queued', queuePosition: event.position };
    case 'run.started':
      return {
        ...state,
        chatId: event.chatId ?? state.chatId,
        phase: state.phase === 'queued' ? 'thinking' : state.phase,
      };
    case 'text.delta':
      return { ...state, phase: 'writing', live: state.live + event.text };
    case 'tool.started':
      return { ...state, phase: 'tool', toolLabel: event.label };
    case 'tool.finished':
      return { ...state, phase: 'thinking', toolLabel: null, entities: addEntities(state, event.entities) };
    case 'action.pending':
      if (state.actions.some((a) => a.id === event.action.id)) return state;
      return { ...state, actions: [...state.actions, event.action] };
    case 'message.saved': {
      const { message } = event;
      if (state.savedMessageIds.includes(message.id)) return state;
      const savedMessageIds = [...state.savedMessageIds, message.id];
      const chatId = state.chatId ?? message.chatId ?? null;
      if (message.role === 'TOOL') {
        const entities = message.blocks.flatMap((b) => (b.type === 'tool_result' ? (b.entities ?? []) : []));
        return { ...state, chatId, savedMessageIds, entities: addEntities(state, entities) };
      }
      if (message.role !== 'ASSISTANT') return { ...state, chatId, savedMessageIds };
      const text = message.blocks
        .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim();
      return {
        ...state,
        chatId,
        savedMessageIds,
        committed: text ? [...state.committed, text] : state.committed,
        live: '',
      };
    }
    case 'memory.saved': {
      // `?? []`: a state restored from before Phase 11 has no list.
      const saved = state.memorySaved ?? [];
      if (saved.includes(event.memory.description)) return state;
      return { ...state, memorySaved: [...saved, event.memory.description] };
    }
    case 'run.completed':
      return { ...state, terminal: { kind: 'completed', awaitingConfirmation: event.status === 'AWAITING_CONFIRMATION' } };
    case 'run.failed':
      return { ...state, terminal: { kind: 'failed', code: event.code } };
    case 'run.cancelled':
      return { ...state, terminal: { kind: 'cancelled' } };
    default:
      return state;
  }
}

/** Everything the assistant wrote in this run so far (saved + streaming). */
export function answerTextOf(state: AgentBotRunState): string {
  return [...state.committed, state.live.trim()].filter(Boolean).join('\n\n');
}

// --- callback data (≤ 64 bytes; ids are cuid-sized) -----------------------------------------

export const AGENT_CALLBACK_PREFIX = 'agent:';

export type AgentBotCallback =
  | { kind: 'open' }
  | { kind: 'example'; index: 1 | 2 | 3 }
  | { kind: 'new' }
  /** "💬 Chats" under an answer: sends the list as a new message. */
  | { kind: 'list' }
  /** Pager inside the list: edits the list message. */
  | { kind: 'chats'; page: number }
  | { kind: 'switch'; chatId: string }
  | { kind: 'stop'; runId: string }
  | { kind: 'exit' }
  | { kind: 'confirm'; actionId: string }
  /** Allow once + store ALWAYS_ALLOW for the tool (confirm with `remember: 'always'`). */
  | { kind: 'always'; actionId: string }
  | { kind: 'reject'; actionId: string }
  /** 🔐 Permissions menu: `edit` re-renders the menu message in place (Back from reset). */
  | { kind: 'perms'; edit: boolean }
  /** Toggle one tool Ask ↔ Always allow: by name, or by list index when the name is too long. */
  | { kind: 'perm'; tool: { name: string } | { index: number } }
  /** Reset all: `confirmed=false` asks first, `true` resets. */
  | { kind: 'permReset'; confirmed: boolean };

const ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;
const TOOL_NAME_PATTERN = /^[a-z0-9_]{1,64}$/;

/** Telegram's limit on `callback_data`, in bytes. */
export const TELEGRAM_CALLBACK_DATA_MAX_BYTES = 64;

export function callbackDataFits(data: string): boolean {
  return Buffer.byteLength(data, 'utf8') <= TELEGRAM_CALLBACK_DATA_MAX_BYTES;
}

/** Toggle callback for a tool: `agent:perm:<name>`, or `agent:permi:<index>` if that would not fit. */
export function permToggleCallbackData(toolName: string, index: number): string {
  const byName = agentCallbackData({ kind: 'perm', tool: { name: toolName } });
  return callbackDataFits(byName) ? byName : agentCallbackData({ kind: 'perm', tool: { index } });
}

export function agentCallbackData(callback: AgentBotCallback): string {
  switch (callback.kind) {
    case 'open':
    case 'new':
    case 'list':
    case 'exit':
      return `agent:${callback.kind}`;
    case 'example':
      return `agent:ex:${callback.index}`;
    case 'chats':
      return `agent:chats:${callback.page}`;
    case 'switch':
      return `agent:sw:${callback.chatId}`;
    case 'stop':
      return `agent:stop:${callback.runId}`;
    case 'confirm':
      return `agent:confirm:${callback.actionId}`;
    case 'always':
      return `agent:always:${callback.actionId}`;
    case 'reject':
      return `agent:reject:${callback.actionId}`;
    case 'perms':
      return callback.edit ? 'agent:perms:edit' : 'agent:perms';
    case 'perm':
      return 'name' in callback.tool ? `agent:perm:${callback.tool.name}` : `agent:permi:${callback.tool.index}`;
    case 'permReset':
      return callback.confirmed ? 'agent:preset:yes' : 'agent:preset';
  }
}

/** Parses `agent:*` callback data; malformed → null. Ids are syntax-checked only. */
export function parseAgentCallback(data: string): AgentBotCallback | null {
  if (!data.startsWith(AGENT_CALLBACK_PREFIX)) return null;
  const [, verb, arg, extra] = data.split(':');
  if (extra !== undefined) return null;
  const id = arg !== undefined && ID_PATTERN.test(arg) ? arg : null;
  switch (verb) {
    case 'open':
    case 'new':
    case 'list':
    case 'exit':
      return arg === undefined ? { kind: verb } : null;
    case 'ex':
      return arg === '1' || arg === '2' || arg === '3' ? { kind: 'example', index: Number(arg) as 1 | 2 | 3 } : null;
    case 'chats': {
      const page = Number(arg);
      return Number.isInteger(page) && page >= 0 && page < 100 ? { kind: 'chats', page } : null;
    }
    case 'sw':
      return id ? { kind: 'switch', chatId: id } : null;
    case 'stop':
      return id ? { kind: 'stop', runId: id } : null;
    case 'confirm':
      return id ? { kind: 'confirm', actionId: id } : null;
    case 'always':
      return id ? { kind: 'always', actionId: id } : null;
    case 'reject':
      return id ? { kind: 'reject', actionId: id } : null;
    case 'perms':
      if (arg === undefined) return { kind: 'perms', edit: false };
      return arg === 'edit' ? { kind: 'perms', edit: true } : null;
    case 'perm':
      return arg !== undefined && TOOL_NAME_PATTERN.test(arg) ? { kind: 'perm', tool: { name: arg } } : null;
    case 'permi': {
      const index = Number(arg);
      return arg !== undefined && /^\d{1,3}$/.test(arg) ? { kind: 'perm', tool: { index } } : null;
    }
    case 'preset':
      if (arg === undefined) return { kind: 'permReset', confirmed: false };
      return arg === 'yes' ? { kind: 'permReset', confirmed: true } : null;
    default:
      return null;
  }
}

// --- keyboards --------------------------------------------------------------------------------

/** New chat · Chats / Permissions · Exit (two rows so the labels stay readable on phones). */
export function controlsRows(lang: string): InlineKeyboardButton[][] {
  return [
    [
      { text: agentBotT('button.newChat', lang), callback_data: agentCallbackData({ kind: 'new' }) },
      { text: agentBotT('button.chats', lang), callback_data: agentCallbackData({ kind: 'list' }) },
    ],
    [
      { text: agentBotT('button.permissions', lang), callback_data: agentCallbackData({ kind: 'perms', edit: false }) },
      { text: agentBotT('button.exit', lang), callback_data: agentCallbackData({ kind: 'exit' }) },
    ],
  ];
}

export function stopKeyboard(lang: string, runId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [[{ text: agentBotT('button.stop', lang), callback_data: agentCallbackData({ kind: 'stop', runId }) }]],
  };
}

export function introKeyboard(lang: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      ...([1, 2, 3] as const).map((index) => [
        { text: agentBotT(`example.${index}`, lang), callback_data: agentCallbackData({ kind: 'example', index }) },
      ]),
      ...controlsRows(lang),
    ],
  };
}

export function controlsKeyboard(lang: string): InlineKeyboardMarkup {
  return { inline_keyboard: controlsRows(lang) };
}

export type AgentBotLinkOptions = {
  /** `config.frontendUrl`. */
  frontendUrl: string;
  /** Telegram rejects URL buttons on loopback hosts: links go into the text instead. */
  inlineUrlButtons: boolean;
};

const MAX_ENTITY_BUTTONS = 6;
const BUTTON_TITLE_MAX = 48;

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** Handoff url → absolute https link: in-app paths resolve against the app; other schemes are dropped. */
function handoffUrl(url: string, base: string): string | null {
  if (url.startsWith('/') && !url.startsWith('//')) return `${base}${url}`;
  return /^https:\/\//i.test(url) ? url : null;
}

/** Game / league / handoff refs from tool data (never from model text) → app links. */
export function entityLinks(entities: AgentEntityRef[], frontendUrl: string): { label: string; url: string }[] {
  const base = frontendUrl.replace(/\/$/, '');
  const links: { label: string; url: string }[] = [];
  for (const entity of entities) {
    if (entity.type === 'handoff') {
      const url = handoffUrl(entity.url, base);
      if (url) links.push({ label: `➡️ ${truncate(entity.label.trim() || '…', BUTTON_TITLE_MAX)}`, url });
    } else if (entity.type === 'game' || entity.type === 'league_season') {
      const title = entity.title?.trim() || '…';
      links.push({
        label: `🎾 ${truncate(title, BUTTON_TITLE_MAX)}`,
        url: `${base}/games/${encodeURIComponent(entity.id)}`,
      });
    }
    if (links.length >= MAX_ENTITY_BUTTONS) break;
  }
  return links;
}

/** In-app path → absolute app URL. */
export function appUrl(frontendUrl: string, path: string): string {
  return `${frontendUrl.replace(/\/$/, '')}${path}`;
}

/** The AI chat in the app (`/ai/:chatId`; opens the thread on mobile, the split view on desktop). */
export function appChatUrl(frontendUrl: string, chatId: string | null): string {
  return appUrl(frontendUrl, chatId ? `/ai/${encodeURIComponent(chatId)}` : '/?tab=ai');
}

export const CONNECTED_CLUBS_PATH = '/profile/connected-clubs';

/**
 * URL links → one button per row, or (loopback `frontendUrl`, which Telegram rejects as a
 * button) `<a>` anchors to append to the text.
 */
function placeLinks(
  links: { label: string; url: string }[],
  options: AgentBotLinkOptions,
): { rows: InlineKeyboardButton[][]; anchors: string } {
  if (options.inlineUrlButtons) return { rows: links.map((link) => [{ text: link.label, url: link.url }]), anchors: '' };
  const anchors = links
    .map((link) => `<a href="${escapeTelegramHtml(link.url)}">${escapeTelegramHtml(link.label)}</a>`)
    .join('\n');
  return { rows: [], anchors };
}

// --- renders ------------------------------------------------------------------------------------

const PREVIEW_MAX_CHARS = 3500;

/** The status message while the run is live. */
export function renderAgentBotStatus(state: AgentBotRunState, lang: string): TelegramMessageRender {
  const answer = answerTextOf(state);
  let header: string;
  if (state.phase === 'queued') {
    header = agentBotT('status.queued', lang, { position: state.queuePosition ?? 1 });
  } else if (state.phase === 'tool' && state.toolLabel) {
    header = `🔎 ${escapeTelegramHtml(state.toolLabel)}…`;
  } else if (state.phase === 'writing') {
    header = agentBotT('status.writing', lang);
  } else {
    header = agentBotT('status.thinking', lang);
  }
  const body = answer ? agentMarkdownToTelegramHtml(tailForPreview(answer, PREVIEW_MAX_CHARS)) : '';
  // Answer first while writing (the header becomes a footer), header alone otherwise.
  const html = body ? `${body}\n\n<i>${header}</i>` : header;
  return { html, keyboard: stopKeyboard(lang, state.runId) };
}

function terminalNote(terminal: AgentBotTerminal, lang: string): string | null {
  if (terminal.kind === 'cancelled') return agentBotT('status.stopped', lang);
  if (terminal.kind === 'failed') {
    if (terminal.code === 'TIMEOUT') return agentBotT('error.timeout', lang);
    if (terminal.code === 'LLM_ERROR') return agentBotT('error.llm', lang);
    return agentBotT('error.generic', lang);
  }
  return null;
}

export type AgentBotFinalOptions = {
  /** The user's zone (current city); booking / slot times get a tz label when the club's differs. */
  userTimeZone?: string | null;
};

/** Entities a run produced: tool results, plus the results of writes that ran without a tap. */
function finalEntities(state: AgentBotRunState): AgentEntityRef[] {
  const fromActions = state.actions.flatMap((a) => (a.autoApproved ? (a.result?.entities ?? []) : []));
  return fromActions.length ? addEntities(state, fromActions) : state.entities;
}

/**
 * The final messages for a finished run: the first replaces the status message, the rest
 * are sent after it. The last one carries the booking / slot lists, the game and handoff
 * links, and the controls row.
 */
export function renderAgentBotFinal(
  state: AgentBotRunState,
  lang: string,
  links: AgentBotLinkOptions,
  options: AgentBotFinalOptions = {},
): TelegramMessageRender[] {
  const terminal = state.terminal ?? { kind: 'failed', code: 'INTERNAL' };
  const answer = answerTextOf(state);
  const chunks = agentAnswerToTelegramMessages(answer);
  const note = terminalNote(terminal, lang);
  if (note) {
    const noteHtml = `<i>${escapeTelegramHtml(note)}</i>`;
    const last = chunks[chunks.length - 1];
    if (last !== undefined && telegramHtmlTextLength(last) + note.length + 2 <= TELEGRAM_MESSAGE_MAX - 400) {
      chunks[chunks.length - 1] = `${last}\n\n${noteHtml}`;
    } else {
      chunks.push(noteHtml);
    }
  }
  if (chunks.length === 0) chunks.push(escapeTelegramHtml(agentBotT('answer.empty', lang)));
  const autoLines = [
    ...autoApprovedLines(state.actions, lang),
    ...(state.memorySaved ?? []).map(
      (description) => `<i>${escapeTelegramHtml(agentBotT('memory.saved', lang, { description }))}</i>`,
    ),
  ];
  if (autoLines.length > 0) chunks[chunks.length - 1] = `${chunks[chunks.length - 1]}\n\n${autoLines.join('\n')}`;

  const entities = finalEntities(state);
  const block = renderEntityTextBlock(entities, lang, { userTimeZone: options.userTimeZone ?? null });
  if (block.html) {
    const last = chunks[chunks.length - 1];
    // The block is capped well under the limit; it gets its own message when it doesn't fit.
    if (last.length + block.html.length + 2 <= TELEGRAM_MESSAGE_MAX - 400) {
      chunks[chunks.length - 1] = `${last}\n\n${block.html}`;
    } else {
      chunks.push(block.html);
    }
  }

  const linkList = entityLinks(entities, links.frontendUrl);
  // A truncated booking / slot list: the full one is in the app's chat.
  if (block.hidden > 0) {
    linkList.push({ label: agentBotT('button.openInApp', lang), url: appChatUrl(links.frontendUrl, state.chatId) });
  }
  const placed = placeLinks(linkList, links);
  let lastHtml = chunks[chunks.length - 1];
  if (placed.anchors) lastHtml = `${lastHtml}\n\n${placed.anchors}`;
  chunks[chunks.length - 1] = lastHtml;
  const rows: InlineKeyboardButton[][] = [...placed.rows, ...controlsRows(lang)];

  return chunks.map((html, index) =>
    index === chunks.length - 1 ? { html, keyboard: { inline_keyboard: rows } } : { html },
  );
}

/**
 * "Done automatically (you allowed <tool>)" for each write this run executed without a tap
 * (the user always allows that tool), plus the partial-result note when only part of it
 * happened. Failed auto-approved writes are reported by the model.
 */
export function autoApprovedLines(actions: AgentPendingActionDto[], lang: string): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const action of actions) {
    if (!action.autoApproved || action.status !== 'EXECUTED') continue;
    if (action.result?.partial) {
      const message = action.result.message ? ` ${escapeTelegramHtml(action.result.message)}` : '';
      lines.push(`<b>${escapeTelegramHtml(agentBotT('action.partial', lang))}</b>${message}`);
    }
    if (seen.has(action.toolName)) continue;
    seen.add(action.toolName);
    const tool = agentToolPermissionText(lang, action.toolName).name;
    lines.push(`<i>${escapeTelegramHtml(agentBotT('action.autoApproved', lang, { tool }))}</i>`);
  }
  return lines;
}

/** Confirmation card for a pending write. Every line comes from the server-built preview. */
function actionCardBody(action: AgentPendingActionDto): string {
  const { preview } = action;
  const lines: string[] = [`📝 <b>${escapeTelegramHtml(preview.title)}</b>`];
  for (const line of preview.lines) {
    const from = line.from === null ? null : escapeTelegramHtml(line.from);
    const to = line.to === null ? null : escapeTelegramHtml(line.to);
    const value = from !== null && to !== null ? `${from} → ${to}` : (to ?? from ?? '');
    lines.push(`• ${escapeTelegramHtml(line.label)}: ${value}`);
  }
  for (const warning of preview.warnings) lines.push(`⚠️ ${escapeTelegramHtml(warning)}`);
  return lines.join('\n');
}

/**
 * The card for a pending write. Server-executed: ✖ Reject · ✅ Allow once (+ ♾ Always allow).
 * Client-executed (`execution: 'client'`, booking plan §14.5): only the app can run it, so
 * ✖ Reject · 📱 Open in app (`/ai/<chatId>`), never ✅ / ♾.
 */
export function renderAgentActionCard(
  action: AgentPendingActionDto,
  lang: string,
  links?: AgentBotLinkOptions,
): TelegramMessageRender {
  const body = actionCardBody(action);
  const expires = `<i>${escapeTelegramHtml(agentBotT('action.expires', lang))}</i>`;
  if (action.execution !== 'client') {
    return { html: `${body}\n\n${expires}`, keyboard: { inline_keyboard: actionCardRows(action, lang) } };
  }
  const handoff = clientHandoff(action.id, action.chatId, lang, links);
  const clientNote = `<i>${escapeTelegramHtml(agentBotT('action.clientOnly', lang))}</i>`;
  const anchors = handoff.anchors ? `\n${handoff.anchors}` : '';
  return { html: `${body}\n\n${clientNote}${anchors}\n${expires}`, keyboard: { inline_keyboard: handoff.rows } };
}

/**
 * ✖ Reject · 📱 Open in app for a client-executed action (card, and the 409
 * CLIENT_EXECUTION_REQUIRED fallback). Without URL buttons the app link is an anchor.
 */
export function clientHandoff(
  actionId: string,
  chatId: string | null,
  lang: string,
  links: AgentBotLinkOptions | undefined,
): { rows: InlineKeyboardButton[][]; anchors: string } {
  const reject: InlineKeyboardButton = {
    text: agentBotT('button.reject', lang),
    callback_data: agentCallbackData({ kind: 'reject', actionId }),
  };
  if (!links) return { rows: [[reject]], anchors: '' };
  const open = { label: agentBotT('button.openInApp', lang), url: appChatUrl(links.frontendUrl, chatId) };
  if (links.inlineUrlButtons) return { rows: [[reject, { text: open.label, url: open.url }]], anchors: '' };
  return { rows: [[reject]], anchors: placeLinks([open], links).anchors };
}

/** ✖ Reject · ✅ Allow once, then ♾ Always allow on its own row (standard-tier calls only). */
function actionCardRows(action: AgentPendingActionDto, lang: string): InlineKeyboardButton[][] {
  const rows: InlineKeyboardButton[][] = [
    [
      { text: agentBotT('button.reject', lang), callback_data: agentCallbackData({ kind: 'reject', actionId: action.id }) },
      { text: agentBotT('button.confirm', lang), callback_data: agentCallbackData({ kind: 'confirm', actionId: action.id }) },
    ],
  ];
  if (action.canAlwaysAllow) {
    rows.push([
      { text: agentBotT('button.alwaysAllow', lang), callback_data: agentCallbackData({ kind: 'always', actionId: action.id }) },
    ]);
  }
  return rows;
}

/**
 * The card after the user decided (decision buttons removed, outcome appended). UNKNOWN
 * (a client lease expired unreported) → "Result unknown — check Connected clubs" with a
 * link there; a partial result → "Partly done" + its message. Handoffs in the result
 * (e.g. `/create-game?bookingIds=`) become links.
 */
export function renderAgentActionOutcome(
  action: AgentPendingActionDto,
  lang: string,
  outcome: AgentActionOutcome,
  options: { remembered?: boolean; links?: AgentBotLinkOptions } = {},
): TelegramMessageRender {
  const card = actionCardBody(action);
  const resultMessage = action.result?.message ? escapeTelegramHtml(action.result.message) : null;
  const linkList: { label: string; url: string }[] = [];
  let footer: string;
  if (outcome === 'unknown') {
    footer = `<b>${escapeTelegramHtml(agentBotT('action.unknown', lang))}</b>${resultMessage ? `\n${resultMessage}` : ''}`;
    if (options.links) {
      linkList.push({
        label: agentBotT('button.connectedClubs', lang),
        url: appUrl(options.links.frontendUrl, CONNECTED_CLUBS_PATH),
      });
    }
  } else if (outcome === 'failed') {
    footer = `<b>⚠️</b> ${resultMessage ?? escapeTelegramHtml(agentBotT('error.generic', lang))}`;
  } else if (outcome === 'confirmed' && action.result?.partial) {
    footer = `<b>${escapeTelegramHtml(agentBotT('action.partial', lang))}</b>${resultMessage ? `\n${resultMessage}` : ''}`;
  } else {
    const key = outcome === 'confirmed' ? 'action.confirmed' : outcome === 'rejected' ? 'action.rejected' : 'action.gone';
    footer = `<b>${escapeTelegramHtml(agentBotT(key, lang))}</b>${resultMessage ? `\n${resultMessage}` : ''}`;
    if (outcome === 'confirmed' && options.remembered) {
      const tool = agentToolPermissionText(lang, action.toolName).name;
      footer += `\n<i>${escapeTelegramHtml(agentBotT('action.remembered', lang, { tool }))}</i>`;
    }
  }
  if (options.links && action.result?.entities?.length) {
    linkList.push(...entityLinks(action.result.entities, options.links.frontendUrl));
  }
  const placed = options.links ? placeLinks(linkList, options.links) : { rows: [], anchors: '' };
  const anchors = placed.anchors ? `\n\n${placed.anchors}` : '';
  return { html: `${card}\n\n${footer}${anchors}`, keyboard: { inline_keyboard: placed.rows } };
}

export type AgentActionOutcome = 'confirmed' | 'rejected' | 'failed' | 'unknown' | 'gone' | 'pending';

/** What a card should say for an action's current status. */
export function actionOutcomeOf(status: AgentPendingActionDto['status']): AgentActionOutcome {
  switch (status) {
    case 'EXECUTED':
    case 'CONFIRMED':
      return 'confirmed';
    case 'REJECTED':
      return 'rejected';
    case 'FAILED':
      return 'failed';
    case 'UNKNOWN':
      return 'unknown';
    case 'EXPIRED':
      return 'gone';
    default:
      return 'pending';
  }
}
