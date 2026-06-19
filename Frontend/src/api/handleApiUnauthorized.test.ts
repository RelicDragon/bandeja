import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const logoutMock = vi.fn().mockResolvedValue(undefined);

vi.mock('@/store/authStore', () => ({
  useAuthStore: {
    getState: () => ({ logout: logoutMock }),
  },
}));

describe('handleApiUnauthorizedIfNeeded', () => {
  beforeEach(() => {
    vi.resetModules();
    logoutMock.mockClear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-19T12:00:00.000Z'));
    vi.stubGlobal('window', {
      location: { pathname: '/find' },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('skips logout during post-login grace', async () => {
    const { markLoginCompleted } = await import('@/utils/authLoginGrace');
    const { handleApiUnauthorizedIfNeeded } = await import('@/api/handleApiUnauthorized');

    markLoginCompleted();
    handleApiUnauthorizedIfNeeded();
    handleApiUnauthorizedIfNeeded({ forceSessionClear: true });

    expect(logoutMock).not.toHaveBeenCalled();
  });

  it('logs out after post-login grace expires', async () => {
    const { markLoginCompleted } = await import('@/utils/authLoginGrace');
    const { handleApiUnauthorizedIfNeeded } = await import('@/api/handleApiUnauthorized');

    markLoginCompleted();
    vi.advanceTimersByTime(5001);
    handleApiUnauthorizedIfNeeded();

    expect(logoutMock).toHaveBeenCalledTimes(1);
  });

  it('does not logout on public auth routes outside grace', async () => {
    vi.stubGlobal('window', {
      location: { pathname: '/login' },
    });
    const { handleApiUnauthorizedIfNeeded } = await import('@/api/handleApiUnauthorized');

    handleApiUnauthorizedIfNeeded();

    expect(logoutMock).not.toHaveBeenCalled();
  });
});
