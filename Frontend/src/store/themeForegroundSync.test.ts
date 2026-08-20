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

import { startThemeForegroundSync } from './themeForegroundSync';

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
    onForeground = vi.fn();
    native.isNative = false;
    capListeners.resume.length = 0;
    capListeners.appStateChange.length = 0;
    setVisibility('visible');
  });

  afterEach(() => {
    stop?.();
    stop = undefined;
    setVisibility(originalVisibility);
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

  it('registers Capacitor resume independently of visibilitychange', async () => {
    native.isNative = true;
    stop = startThemeForegroundSync(onForeground);
    await Promise.resolve();

    expect(capListeners.resume).toHaveLength(1);
    expect(capListeners.appStateChange).toHaveLength(1);
    requireFn(capListeners.resume[0])();
    requireFn(capListeners.appStateChange[0])({ isActive: true });
    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));

    expect(onForeground).toHaveBeenCalledTimes(3);
  });
});
