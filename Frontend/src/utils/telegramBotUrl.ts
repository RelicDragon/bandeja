import { config } from '@/config/media';
import { isCapacitor } from './capacitor';

function telegramBotDomain(): string | null {
  const base = config.telegramBotUrl.replace(/\/$/, '');
  return base.match(/t\.me\/([^/?#]+)/i)?.[1] ?? null;
}

export function buildTelegramBotStartUrl(start: string): string {
  const encodedStart = encodeURIComponent(start);
  if (isCapacitor()) {
    const domain = telegramBotDomain();
    if (domain) {
      return `tg://resolve?domain=${encodeURIComponent(domain)}&start=${encodedStart}`;
    }
  }
  const base = config.telegramBotUrl.replace(/\/$/, '');
  return base.includes('?')
    ? `${base}&start=${encodedStart}`
    : `${base}?start=${encodedStart}`;
}
