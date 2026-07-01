import { describe, expect, it, vi } from 'vitest';
import {
  runUnreadAuthBootstrapRefreshIfNeeded,
  type UnreadAuthBootstrapState,
  unreadAuthBootstrapRefreshDeps,
} from '@/hooks/useUnreadAuthBootstrapRefresh';

function simulateReactUnreadBootstrapEffect(refreshAll: () => void) {
  let lastDeps: UnreadAuthBootstrapState | null = null;
  return {
    render(state: UnreadAuthBootstrapState) {
      if (
        lastDeps &&
        lastDeps.isInitializing === state.isInitializing &&
        lastDeps.isAuthenticated === state.isAuthenticated
      ) {
        return;
      }
      lastDeps = state;
      runUnreadAuthBootstrapRefreshIfNeeded(state, refreshAll);
    },
  };
}

describe('unread auth bootstrap refresh (Phase 0 #236)', () => {
  it('does not include pathname in effect deps', () => {
    expect(unreadAuthBootstrapRefreshDeps).toEqual(['isInitializing', 'isAuthenticated']);
    expect(unreadAuthBootstrapRefreshDeps).not.toContain('pathname');
    expect(unreadAuthBootstrapRefreshDeps).not.toContain('location');
  });

  it('calls refreshAll when auth bootstrap completes', () => {
    const refreshAll = vi.fn();
    runUnreadAuthBootstrapRefreshIfNeeded(
      { isInitializing: false, isAuthenticated: true },
      refreshAll
    );
    expect(refreshAll).toHaveBeenCalledTimes(1);
  });

  it('skips refresh while initializing or unauthenticated', () => {
    const refreshAll = vi.fn();
    runUnreadAuthBootstrapRefreshIfNeeded(
      { isInitializing: true, isAuthenticated: true },
      refreshAll
    );
    runUnreadAuthBootstrapRefreshIfNeeded(
      { isInitializing: false, isAuthenticated: false },
      refreshAll
    );
    expect(refreshAll).not.toHaveBeenCalled();
  });

  it('does not call refreshAll when only pathname changes (effect deps unchanged)', () => {
    const refreshAll = vi.fn();
    const effect = simulateReactUnreadBootstrapEffect(refreshAll);
    const authReady = { isInitializing: false, isAuthenticated: true };

    effect.render(authReady);
    expect(refreshAll).toHaveBeenCalledTimes(1);

    effect.render(authReady);
    expect(refreshAll).toHaveBeenCalledTimes(1);
  });

  it('calls refreshAll again only when auth deps change', () => {
    const refreshAll = vi.fn();
    const effect = simulateReactUnreadBootstrapEffect(refreshAll);

    effect.render({ isInitializing: true, isAuthenticated: false });
    expect(refreshAll).not.toHaveBeenCalled();

    effect.render({ isInitializing: false, isAuthenticated: true });
    expect(refreshAll).toHaveBeenCalledTimes(1);
  });
});
