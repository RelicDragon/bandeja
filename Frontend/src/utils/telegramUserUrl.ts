import { isCapacitor } from './capacitor';

export type TelegramContact = {
  telegramId?: string | null;
  telegramUsername?: string | null;
};

export type TelegramUserOpenPlan = {
  url: string;
  webFallback: string | null;
};

function isMobileTelegramClient(): boolean {
  if (isCapacitor()) return true;
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function buildTelegramUserOpenPlan(opts: TelegramContact): TelegramUserOpenPlan | null {
  const username = opts.telegramUsername?.trim().replace(/^@/, '');
  if (username) {
    return { url: `https://t.me/${username}`, webFallback: null };
  }

  const id = opts.telegramId?.trim();
  if (!id) return null;

  const webFallback = `https://web.telegram.org/k/#${id}`;
  if (isMobileTelegramClient()) {
    return { url: `tg://openmessage?user_id=${id}`, webFallback };
  }

  return { url: `tg://user?id=${id}`, webFallback };
}

export function buildTelegramUserUrl(opts: TelegramContact): string | null {
  return buildTelegramUserOpenPlan(opts)?.url ?? null;
}
