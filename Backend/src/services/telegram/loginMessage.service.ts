import { InlineKeyboard } from 'grammy';

type TelegramLoginReplyOptions = {
  reply_markup?: InlineKeyboard;
  parse_mode?: 'HTML';
};

export type TelegramLoginReply = (
  text: string,
  options?: TelegramLoginReplyOptions
) => Promise<{ message_id: number }>;

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized === '::1' ||
    normalized === '[::1]' ||
    normalized === '0.0.0.0' ||
    /^127\./.test(normalized)
  );
}

export function canUseTelegramInlineUrl(loginUrl: string): boolean {
  try {
    const url = new URL(loginUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    return !isLoopbackHost(url.hostname);
  } catch {
    return false;
  }
}

function isTelegramInlineUrlRejectedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const maybeTelegramError = error as { error_code?: number; description?: string };
  return (
    maybeTelegramError.error_code === 400 &&
    typeof maybeTelegramError.description === 'string' &&
    maybeTelegramError.description.includes('inline keyboard button URL') &&
    maybeTelegramError.description.includes('Wrong HTTP URL')
  );
}

function withPlainUrl(message: string, loginUrl: string): string {
  return `${message}\n\n${loginUrl}`;
}

export function escapeTelegramHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function boldTelegramOtpCode(code: string): string {
  return `<b>${escapeTelegramHtml(code)}</b>`;
}

export async function sendTelegramLoginUrlMessage(params: {
  reply: TelegramLoginReply;
  message: string;
  buttonText: string;
  loginUrl: string;
  parseMode?: 'HTML';
}): Promise<{ message_id: number }> {
  const { reply, message, buttonText, loginUrl, parseMode } = params;
  const fallbackUrl = parseMode === 'HTML' ? escapeTelegramHtml(loginUrl) : loginUrl;
  const baseOptions = parseMode ? { parse_mode: parseMode } : undefined;

  if (!canUseTelegramInlineUrl(loginUrl)) {
    return reply(withPlainUrl(message, fallbackUrl), baseOptions);
  }

  try {
    return await reply(message, {
      ...baseOptions,
      reply_markup: new InlineKeyboard().url(buttonText, loginUrl),
    });
  } catch (error) {
    if (isTelegramInlineUrlRejectedError(error)) {
      return reply(withPlainUrl(message, fallbackUrl), baseOptions);
    }
    throw error;
  }
}
