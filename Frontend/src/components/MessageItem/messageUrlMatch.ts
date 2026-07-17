export function matchesMessageUrl(url: string | undefined, hiddenUrl: string | null): boolean {
  if (!url || !hiddenUrl) return false;
  if (url === hiddenUrl) return true;
  try {
    const current = new URL(url);
    const hidden = new URL(hiddenUrl);
    return current.pathname === hidden.pathname && current.search === hidden.search;
  } catch {
    return false;
  }
}
