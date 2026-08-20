import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getBugCreatePlatformInfo } from './bugCreatePlatformInfo';
import type { BugCreatePlatformInfoDeps } from './bugCreatePlatformInfo';

function nativeDeps(overrides: Partial<BugCreatePlatformInfoDeps> = {}): BugCreatePlatformInfoDeps {
  return {
    isCapacitor: () => true,
    isIOS: () => true,
    isAndroid: () => false,
    getCapacitorPlatform: () => 'ios',
    getAppInfo: async () => ({
      version: '1.2.3',
      buildNumber: '45',
      platform: 'ios',
    }),
    timeoutMs: 1_000,
    ...overrides,
  };
}

describe('getBugCreatePlatformInfo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns web-app off native', async () => {
    await expect(
      getBugCreatePlatformInfo({
        ...nativeDeps(),
        isCapacitor: () => false,
      })
    ).resolves.toBe('web-app');
  });

  it('formats native app info', async () => {
    await expect(getBugCreatePlatformInfo(nativeDeps())).resolves.toBe('iOS 1.2.3 (45)');
  });

  it('skips hung App.getInfo after timeout', async () => {
    const pending = getBugCreatePlatformInfo(
      nativeDeps({
        getAppInfo: () => new Promise(() => undefined),
        timeoutMs: 50,
      })
    );
    const assertion = expect(pending).resolves.toBe('iOS (unknown)');
    await vi.advanceTimersByTimeAsync(80);
    await assertion;
  });

  it('skips thrown App.getInfo', async () => {
    await expect(
      getBugCreatePlatformInfo(
        nativeDeps({
          getAppInfo: async () => {
            throw new Error('native bridge');
          },
        })
      )
    ).resolves.toBe('iOS (unknown)');
  });
});
