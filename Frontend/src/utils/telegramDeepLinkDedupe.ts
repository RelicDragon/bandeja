import { isTelegramAutoLoginPath } from '@/utils/telegramAutoLoginPath';

const DEDUPE_MS = 2500;
let lastPath: string | null = null;
let lastAt = 0;

export function shouldHandleTelegramLoginDeepLink(pathname: string): boolean {
  if (!isTelegramAutoLoginPath(pathname)) {
    return true;
  }
  const now = Date.now();
  if (lastPath === pathname && now - lastAt < DEDUPE_MS) {
    return false;
  }
  lastPath = pathname;
  lastAt = now;
  return true;
}
