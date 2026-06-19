const MAIN_TAB_ROOT_PATHS = ['/', '/find', '/chats', '/leaderboard', '/marketplace'] as const;

export function isMainTabRootPath(pathname: string): boolean {
  return MAIN_TAB_ROOT_PATHS.some((root) => pathname === root || pathname === `${root}/`);
}

/** Scroll container: #root on Capacitor, window/document on web. */
export function getAppScrollElement(): HTMLElement | null {
  if (!document.body.classList.contains('capacitor-app')) {
    return null;
  }
  const root = document.getElementById('root');
  if (!root) return null;
  const { overflowY } = window.getComputedStyle(root);
  if (overflowY === 'auto' || overflowY === 'scroll') {
    return root;
  }
  return null;
}

export function getAppScrollTop(): number {
  const el = getAppScrollElement();
  if (el) return el.scrollTop;
  return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
}

export function scrollAppToTop(behavior: ScrollBehavior = 'smooth'): void {
  const el = getAppScrollElement();
  if (el) {
    el.scrollTo({ top: 0, behavior });
    return;
  }
  window.scrollTo({ top: 0, behavior });
  document.documentElement.scrollTo({ top: 0, behavior });
}

export function subscribeAppScroll(listener: () => void): () => void {
  const el = getAppScrollElement();
  const target: HTMLElement | Window = el ?? window;
  target.addEventListener('scroll', listener, { passive: true });
  return () => target.removeEventListener('scroll', listener);
}
