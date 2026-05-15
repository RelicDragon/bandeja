const DEDUPE_MS = 2500;
let lastPath: string | null = null;
let lastAt = 0;

export function shouldHandleTelegramLoginDeepLink(pathname: string): boolean {
  if (!pathname.startsWith('/login/') || pathname === '/login/phone' || pathname === '/login/telegram') {
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
