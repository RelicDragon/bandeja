// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ isNative: false }));
const capListeners = vi.hoisted(() => ({
  resume: [] as Array<() => void>,
  appStateChange: [] as Array<(state: { isActive: boolean }) => void>,
}));

vi.mock('@/utils/capacitor', () => ({
  isCapacitor: () => native.isNative,
}));

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(async (event: 'resume' | 'appStateChange', listener: (state?: { isActive: boolean }) => void) => {
      if (event === 'resume') {
        capListeners.resume.push(() => listener());
      } else {
        capListeners.appStateChange.push((state) => listener(state));
      }
      return { remove: vi.fn(async () => {}) };
    }),
  },
}));

import { App } from '@capacitor/app';
import { startThemeForegroundSync, THEME_FOREGROUND_RETRY_DELAYS_MS } from './themeForegroundSync';

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
}

function requireFn<T extends (...args: never[]) => unknown>(fn: T | undefined): T {
  expect(fn).toBeTypeOf('function');
  if (!fn) throw new Error('expected listener');
  return fn;
}

describe('startThemeForegroundSync', () => {
  const originalVisibility = document.visibilityState;
  let stop: (() => void) | undefined;
  let onForeground: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    onForeground = vi.fn();
    native.isNative = false;
    capListeners.resume.length = 0;
    capListeners.appStateChange.length = 0;
    setVisibility('visible');
    vi.mocked(App.addListener).mockClear();
  });

  afterEach(() => {
    stop?.();
    stop = undefined;
    setVisibility(originalVisibility);
    vi.useRealTimers();
  });

  it('re-reads theme on document visibilitychange when becoming visible', () => {
    stop = startThemeForegroundSync(onForeground);
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(onForeground).not.toHaveBeenCalled();

    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(onForeground).toHaveBeenCalledTimes(1);
  });

  it('re-reads theme on persisted pageshow', () => {
    stop = startThemeForegroundSync(onForeground);
    window.dispatchEvent(new Event('pageshow'));
    expect(onForeground).not.toHaveBeenCalled();

    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    expect(onForeground).toHaveBeenCalledTimes(1);
  });

  it('re-reads theme on Capacitor resume even if the WebView stays hidden', async () => {
    native.isNative = true;
    setVisibility('hidden');
    stop = startThemeForegroundSync(onForeground);
    await Promise.resolve();

    expect(capListeners.resume).toHaveLength(1);
    requireFn(capListeners.resume[0])();
    expect(onForeground).toHaveBeenCalledTimes(1);
  });

  it('re-reads theme on Capacitor appStateChange becoming active', async () => {
    native.isNative = true;
    setVisibility('hidden');
    stop = startThemeForegroundSync(onForeground);
    await Promise.resolve();

    expect(capListeners.appStateChange).toHaveLength(1);
    const onAppState = requireFn(capListeners.appStateChange[0]);
    onAppState({ isActive: false });
    expect(onForeground).not.toHaveBeenCalled();

    onAppState({ isActive: true });
    expect(onForeground).toHaveBeenCalledTimes(1);
  });

  it('does not attach Capacitor listeners on web', async () => {
    native.isNative = false;
    stop = startThemeForegroundSync(onForeground);
    await Promise.resolve();

    expect(capListeners.resume).toHaveLength(0);
    expect(capListeners.appStateChange).toHaveLength(0);
  });

  it('coalesces resume, appStateChange, and visibilitychange in the same tick', async () => {
    native.isNative = true;
    stop = startThemeForegroundSync(onForeground);
    await Promise.resolve();

    expect(capListeners.resume).toHaveLength(1);
    expect(capListeners.appStateChange).toHaveLength(1);
    requireFn(capListeners.resume[0])();
    requireFn(capListeners.appStateChange[0])({ isActive: true });
    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));

    expect(onForeground).toHaveBeenCalledTimes(1);
  });

  it('schedules a single retry chain for a coalesced burst', async () => {
    native.isNative = true;
    stop = startThemeForegroundSync(onForeground);
    await Promise.resolve();

    requireFn(capListeners.resume[0])();
    requireFn(capListeners.appStateChange[0])({ isActive: true });
    expect(onForeground).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(THEME_FOREGROUND_RETRY_DELAYS_MS[1]);
    expect(onForeground).toHaveBeenCalledTimes(3);
  });

  it('allows a later resume burst after the coalesced tick', async () => {
    native.isNative = true;
    stop = startThemeForegroundSync(onForeground);
    await Promise.resolve();

    requireFn(capListeners.resume[0])();
    expect(onForeground).toHaveBeenCalledTimes(1);

    await Promise.resolve();
    requireFn(capListeners.resume[0])();
    expect(onForeground).toHaveBeenCalledTimes(2);
  });

  it('re-reads again after iOS matchMedia lag on resume', async () => {
    native.isNative = true;
    stop = startThemeForegroundSync(onForeground);
    await Promise.resolve();

    requireFn(capListeners.resume[0])();
    expect(onForeground).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(THEME_FOREGROUND_RETRY_DELAYS_MS[0] - 1);
    expect(onForeground).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    expect(onForeground).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(THEME_FOREGROUND_RETRY_DELAYS_MS[1] - THEME_FOREGROUND_RETRY_DELAYS_MS[0] - 1);
    expect(onForeground).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(1);
    expect(onForeground).toHaveBeenCalledTimes(3);
  });

  it('does not run delayed rereads after stop', async () => {
    native.isNative = true;
    stop = startThemeForegroundSync(onForeground);
    await Promise.resolve();

    requireFn(capListeners.resume[0])();
    expect(onForeground).toHaveBeenCalledTimes(1);
    stop();
    stop = undefined;

    vi.advanceTimersByTime(THEME_FOREGROUND_RETRY_DELAYS_MS[1]);
    expect(onForeground).toHaveBeenCalledTimes(1);
  });

  it('still retries if the immediate reread throws', async () => {
    onForeground.mockImplementation(() => {
      if (onForeground.mock.calls.length === 1) throw new Error('stale webview');
    });
    native.isNative = true;
    stop = startThemeForegroundSync(onForeground);
    await Promise.resolve();

    requireFn(capListeners.resume[0])();
    expect(onForeground).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(THEME_FOREGROUND_RETRY_DELAYS_MS[1]);
    expect(onForeground).toHaveBeenCalledTimes(3);
  });

  it('removes a Capacitor handle that resolves after stop', async () => {
    native.isNative = true;
    const remove = vi.fn(async () => {});
    let resolveHandle: (handle: { remove: ReturnType<typeof vi.fn> }) => void = () => {};
    vi.mocked(App.addListener).mockReturnValue(
      new Promise((resolve) => {
        resolveHandle = resolve;
      }),
    );
    stop = startThemeForegroundSync(onForeground);
    stop();
    stop = undefined;
    resolveHandle({ remove });
    await Promise.resolve();
    expect(remove).toHaveBeenCalled();
  });

  it('ignores failed Capacitor addListener', async () => {
    native.isNative = true;
    vi.mocked(App.addListener).mockRejectedValue(new Error('no plugin'));
    stop = startThemeForegroundSync(onForeground);
    await Promise.resolve();
    expect(onForeground).not.toHaveBeenCalled();
  });
});
