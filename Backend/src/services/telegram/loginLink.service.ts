import { config } from '../../config/env';

export const TELEGRAM_APP_HANDOFF_PARAM = 'tg_app';

export function buildTelegramLoginUrl(linkKey: string): string {
  const url = new URL(`/login/${linkKey}`, config.frontendUrl);
  url.searchParams.set(TELEGRAM_APP_HANDOFF_PARAM, '1');
  return url.href;
}
