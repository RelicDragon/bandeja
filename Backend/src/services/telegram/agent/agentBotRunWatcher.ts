/**
 * Follows one agent run for Telegram: consumes the run's event log (the same replay /
 * subscribe feed as the app's SSE, Redis-backed when `REDIS_URL` is set, so the run may
 * execute in `worker.ts`), edits the status message through a throttler, and on the
 * terminal event replaces it with the final answer + sends confirmation cards.
 *
 * Restart safety: every watched run has a binding (run → chat + status message id) in
 * `agentBotState`. `resumeAll()` at bot start re-attaches to each: the feed replays from
 * id 0 (or rebuilds a finished run from the DB), so the message ends in its correct final
 * state instead of a stuck "Thinking…". The binding is removed once the final render landed.
 */
import type { AgentStreamEvent } from '@bandeja/shared/agentContract';
import type { InlineKeyboardMarkup } from 'grammy/types';
import {
  type AgentBotLinkOptions,
  type AgentBotRunState,
  initialAgentBotRunState,
  reduceAgentBotRun,
  renderAgentActionCard,
  renderAgentBotFinal,
  renderAgentBotStatus,
} from './agentBotView';
import type { AgentBotRunBinding, AgentBotStateStore } from './agentBotState';
import {
  type TelegramEditPort,
  type TelegramMessageRender,
  type ThrottlerClock,
  TelegramEditThrottler,
  isParseEntitiesError,
  stripTelegramHtml,
} from './telegramEditThrottler';

export interface AgentBotTelegramApi extends TelegramEditPort {
  sendMessage(
    chatId: number,
    text: string,
    other: { parse_mode?: 'HTML'; reply_markup?: InlineKeyboardMarkup; link_preview_options?: { is_disabled: boolean } },
  ): Promise<{ message_id: number }>;
  editMessageReplyMarkup(chatId: number, messageId: number, other: { reply_markup?: InlineKeyboardMarkup }): Promise<unknown>;
}

export type AgentRunFeedHandle = { close: () => void };

/**
 * Opens the run's event feed for `userId` (owner-scoped). `null` when the run doesn't exist
 * (or isn't this user's). `onEnd` fires after the terminal event or on close.
 */
export type OpenAgentRunFeed = (
  binding: AgentBotRunBinding,
  onEvent: (event: AgentStreamEvent) => void,
  onEnd: () => void,
) => Promise<AgentRunFeedHandle | null>;

export type AgentBotRunWatcherDeps = {
  api: AgentBotTelegramApi;
  state: AgentBotStateStore;
  openFeed: OpenAgentRunFeed;
  links: AgentBotLinkOptions;
  clock?: ThrottlerClock;
  minIntervalMs?: number;
};

/** Sends an HTML message; on "can't parse entities" resends as plain text. */
export async function sendTelegramHtml(
  api: AgentBotTelegramApi,
  chatId: number,
  render: TelegramMessageRender,
): Promise<{ message_id: number } | null> {
  const base = { reply_markup: render.keyboard, link_preview_options: { is_disabled: true } };
  try {
    return await api.sendMessage(chatId, render.html, { ...base, parse_mode: 'HTML' });
  } catch (error) {
    if (!isParseEntitiesError(error)) {
      console.error('[telegram-agent] send failed', { chatId, error });
      return null;
    }
    try {
      return await api.sendMessage(chatId, render.plain ?? stripTelegramHtml(render.html), base);
    } catch (plainError) {
      console.error('[telegram-agent] plain send failed', { chatId, error: plainError });
      return null;
    }
  }
}

export class AgentBotRunWatcher {
  private readonly watching = new Map<string, Promise<void>>();

  constructor(private readonly deps: AgentBotRunWatcherDeps) {}

  isWatching(runId: string): boolean {
    return this.watching.has(runId);
  }

  /** Starts (or joins) following a run; resolves once its final render was sent. */
  watch(binding: AgentBotRunBinding): Promise<void> {
    const existing = this.watching.get(binding.runId);
    if (existing) return existing;
    const done = this.follow(binding)
      .catch((error) => console.error('[telegram-agent] watcher failed', { runId: binding.runId, error }))
      .finally(() => this.watching.delete(binding.runId));
    this.watching.set(binding.runId, done);
    return done;
  }

  /** Bot start: re-attach to every run a Telegram message still tracks. */
  async resumeAll(): Promise<number> {
    const bindings = await this.deps.state.listBindings();
    for (const binding of bindings) void this.watch(binding);
    return bindings.length;
  }

  private async follow(binding: AgentBotRunBinding): Promise<void> {
    const { api, links } = this.deps;
    const throttler = new TelegramEditThrottler(api, binding.telegramChatId, binding.statusMessageId, {
      clock: this.deps.clock,
      minIntervalMs: this.deps.minIntervalMs,
    });
    let state: AgentBotRunState = initialAgentBotRunState(binding.runId);

    let resolveEnded: () => void = () => {};
    const ended = new Promise<void>((resolve) => {
      resolveEnded = resolve;
    });
    const handle = await this.deps.openFeed(
      binding,
      (event) => {
        state = reduceAgentBotRun(state, event);
        if (!state.terminal) throttler.update(renderAgentBotStatus(state, binding.lang));
      },
      () => resolveEnded(),
    );
    if (handle) await ended;
    if (!state.terminal) {
      // Run missing (deleted / foreign) or the feed closed without a terminal event.
      state = { ...state, terminal: { kind: 'failed', code: 'INTERNAL' } };
    }

    const finals = renderAgentBotFinal(state, binding.lang, links, { userTimeZone: binding.timeZone ?? null });
    const [first, ...rest] = finals;
    const shown = await throttler.flush(first);
    if (!shown) await sendTelegramHtml(api, binding.telegramChatId, first);
    for (const render of rest) await sendTelegramHtml(api, binding.telegramChatId, render);
    for (const action of state.actions) {
      if (action.status !== 'PENDING') continue;
      await sendTelegramHtml(api, binding.telegramChatId, renderAgentActionCard(action, binding.lang, links));
    }
    await this.deps.state.removeBinding(binding.runId).catch((error) =>
      console.error('[telegram-agent] binding cleanup failed', { runId: binding.runId, error }),
    );
  }
}
