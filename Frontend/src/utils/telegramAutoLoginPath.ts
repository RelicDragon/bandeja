export function isTelegramAutoLoginPath(pathname: string): boolean {
  return (
    pathname.startsWith('/login/') &&
    pathname !== '/login/phone' &&
    pathname !== '/login/telegram'
  );
}

export function shouldConsumePendingTelegramAuthPath(
  pathname: string,
  pendingAuthPath: string | null,
  isAuthenticated: boolean
): pendingAuthPath is string {
  if (!pendingAuthPath || isAuthenticated) return false;
  if (!isTelegramAutoLoginPath(pendingAuthPath)) return false;
  if (pathname === pendingAuthPath) return false;
  return pathname === '/login' || pathname === '/';
}
