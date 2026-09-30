/**
 * Coalesces rapid updates of one Telegram message into at most one `editMessageText` per
 * `minIntervalMs` (Telegram allows roughly one edit per second per chat before 429s).
 *
 * - `update(render)` only records the newest wanted state; a timer sends it when allowed.
 *   Intermediate states are dropped — only the latest matters.
 * - 429: waits `retry_after` seconds (at least `minIntervalMs`) and retries the newest state.
 * - "message is not modified": success. "can't parse entities": retried once as plain text.
 * - Message gone ("message to edit not found", "message can't be edited"): the throttler
 *   goes dead; `flush()` reports `false` so the caller can send a fresh message instead.
 * - `flush()` waits for the interval, sends the latest state and resolves when it landed.
 * Clock and timers are injectable for tests.
 */
import type { InlineKeyboardMarkup } from 'grammy/types';

export type TelegramMessageRender = {
  html: string;
  /** Plain-text fallback when Telegram rejects the HTML. Defaults to tag-stripped html. */
  plain?: string;
  keyboard?: InlineKeyboardMarkup;
};

export interface TelegramEditPort {
  editMessageText(
    chatId: number,
    messageId: number,
    text: string,
    other: { parse_mode?: 'HTML'; reply_markup?: InlineKeyboardMarkup; link_preview_options?: { is_disabled: boolean } },
  ): Promise<unknown>;
}

export type ThrottlerClock = {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
};

export const REAL_CLOCK: ThrottlerClock = {
  now: () => Date.now(),
  sleep: (ms) =>
    new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      timer.unref?.();
    }),
};

export const TELEGRAM_EDIT_MIN_INTERVAL_MS = 1_300;
const MAX_ATTEMPTS = 5;

type TelegramErrorShape = { error_code?: number; description?: string; parameters?: { retry_after?: number } };

function telegramErrorOf(error: unknown): TelegramErrorShape {
  return error && typeof error === 'object' ? (error as TelegramErrorShape) : {};
}

export function isNotModifiedError(error: unknown): boolean {
  return /message is not modified/i.test(telegramErrorOf(error).description ?? '');
}

export function isParseEntitiesError(error: unknown): boolean {
  return /can't parse entities|can't find end of the entity|unsupported start tag/i.test(
    telegramErrorOf(error).description ?? '',
  );
}

export function isMessageGoneError(error: unknown): boolean {
  return /message to edit not found|message can't be edited|message_id_invalid|chat not found|bot was blocked/i.test(
    telegramErrorOf(error).description ?? '',
  );
}

/** Seconds from a 429, else null. */
export function retryAfterSeconds(error: unknown): number | null {
  const shape = telegramErrorOf(error);
  if (shape.error_code !== 429) return null;
  const seconds = Number(shape.parameters?.retry_after ?? 1);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 1;
}

export function stripTelegramHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}

function renderKey(render: TelegramMessageRender): string {
  return `${render.html}\u0001${JSON.stringify(render.keyboard ?? null)}`;
}

export class TelegramEditThrottler {
  private wanted: TelegramMessageRender | null = null;
  private lastSentKey: string | null = null;
  private lastAttemptAt = Number.NEGATIVE_INFINITY;
  private sending: Promise<void> | null = null;
  private timerPending = false;
  private dead = false;

  constructor(
    private readonly api: TelegramEditPort,
    private readonly chatId: number,
    private readonly messageId: number,
    private readonly options: { minIntervalMs?: number; clock?: ThrottlerClock } = {},
  ) {}

  private get minIntervalMs(): number {
    return this.options.minIntervalMs ?? TELEGRAM_EDIT_MIN_INTERVAL_MS;
  }

  private get clock(): ThrottlerClock {
    return this.options.clock ?? REAL_CLOCK;
  }

  get isDead(): boolean {
    return this.dead;
  }

  /** Record the newest state; sent when the interval allows. */
  update(render: TelegramMessageRender): void {
    if (this.dead) return;
    this.wanted = render;
    this.schedule();
  }

  private schedule(): void {
    if (this.timerPending || this.sending) return;
    this.timerPending = true;
    const wait = Math.max(0, this.lastAttemptAt + this.minIntervalMs - this.clock.now());
    void this.clock.sleep(wait).then(() => {
      this.timerPending = false;
      void this.sendLatest();
    });
  }

  private sendLatest(): Promise<void> {
    if (this.sending) return this.sending;
    this.sending = this.sendLoop().finally(() => {
      this.sending = null;
      if (!this.dead && this.wanted && renderKey(this.wanted) !== this.lastSentKey) this.schedule();
    });
    return this.sending;
  }

  private async sendLoop(): Promise<void> {
    let plainFallback = false;
    for (let attempt = 0; attempt < MAX_ATTEMPTS && !this.dead; attempt += 1) {
      if (!this.wanted || renderKey(this.wanted) === this.lastSentKey) return;
      const wait = this.lastAttemptAt + this.minIntervalMs - this.clock.now();
      if (wait > 0) await this.clock.sleep(wait);
      // Read after the wait: updates that arrived meanwhile win.
      const render: TelegramMessageRender | null = this.wanted;
      if (!render) return;
      const key = renderKey(render);
      if (key === this.lastSentKey) return;
      this.lastAttemptAt = this.clock.now();
      try {
        const text = plainFallback ? (render.plain ?? stripTelegramHtml(render.html)) : render.html;
        await this.api.editMessageText(this.chatId, this.messageId, text, {
          ...(plainFallback ? {} : { parse_mode: 'HTML' as const }),
          reply_markup: render.keyboard ?? { inline_keyboard: [] },
          link_preview_options: { is_disabled: true },
        });
        this.lastSentKey = key;
        return;
      } catch (error) {
        if (isNotModifiedError(error)) {
          this.lastSentKey = key;
          return;
        }
        const retryAfter = retryAfterSeconds(error);
        if (retryAfter !== null) {
          this.lastAttemptAt = this.clock.now() + retryAfter * 1000 - this.minIntervalMs;
          continue;
        }
        if (isParseEntitiesError(error) && !plainFallback) {
          plainFallback = true;
          continue;
        }
        if (isMessageGoneError(error)) {
          this.dead = true;
          return;
        }
        console.error('[telegram-agent] edit failed', { chatId: this.chatId, messageId: this.messageId, error });
        return;
      }
    }
  }

  /**
   * Sends the latest state now (after the interval) and waits for it. `true` when the
   * message shows it; `false` when the message is gone (send a new one instead).
   */
  async flush(render?: TelegramMessageRender): Promise<boolean> {
    if (render) this.wanted = render;
    if (this.dead) return false;
    for (let guard = 0; guard < MAX_ATTEMPTS && !this.dead; guard += 1) {
      await this.sendLatest();
      if (!this.wanted || renderKey(this.wanted) === this.lastSentKey) break;
    }
    return !this.dead && this.wanted !== null && renderKey(this.wanted) === this.lastSentKey;
  }
}
