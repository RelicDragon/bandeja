import { useEffect } from 'react';
import { useUnreadStore } from '@/store/unreadStore';
import { isTelegramAutoLoginPath } from '@/utils/telegramAutoLoginPath';

export const unreadAuthBootstrapRefreshDeps = ['isInitializing', 'isAuthenticated'] as const;

export type UnreadAuthBootstrapState = {
  isInitializing: boolean;
  isAuthenticated: boolean;
};

export function shouldRefreshUnreadOnAuthBootstrap(state: UnreadAuthBootstrapState): boolean {
  if (state.isInitializing || !state.isAuthenticated) return false;
  if (typeof window !== 'undefined' && isTelegramAutoLoginPath(window.location.pathname)) return false;
  return true;
}

/** Runs unread snapshot refresh on auth bootstrap only — not on navigation. */
export function runUnreadAuthBootstrapRefreshIfNeeded(
  state: UnreadAuthBootstrapState,
  refreshAll: () => void | Promise<void>
): void {
  if (!shouldRefreshUnreadOnAuthBootstrap(state)) return;
  void refreshAll();
}

export function useUnreadAuthBootstrapRefresh(
  isInitializing: boolean,
  isAuthenticated: boolean
): void {
  useEffect(() => {
    runUnreadAuthBootstrapRefreshIfNeeded(
      { isInitializing, isAuthenticated },
      () => useUnreadStore.getState().refreshAll()
    );
  }, [isInitializing, isAuthenticated]);
}
