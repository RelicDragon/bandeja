import { afterEach, describe, expect, it, vi } from 'vitest';
import { isChunkLoadError, recoverFromChunkLoadError } from './chunkLoadRecovery';

describe('isChunkLoadError', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('detects dynamic import failures', () => {
    expect(isChunkLoadError(new Error('Failed to fetch dynamically imported module: https://bandeja.me/assets/MainPage.js'))).toBe(true);
    expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true);
  });

  it('ignores unrelated errors', () => {
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false);
  });

  it('can force recovery even when a recent automatic reload was attempted', async () => {
    const storage = new Map<string, string>([['bandeja_chunk_reload_ts', String(Date.now())]]);
    const reload = vi.fn();
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });
    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistrations: vi.fn(async () => []),
      },
    });
    vi.stubGlobal('window', {
      caches: {
        keys: vi.fn(async () => []),
        delete: vi.fn(async () => true),
      },
      location: { reload },
    });

    await expect(recoverFromChunkLoadError()).resolves.toBe(false);
    expect(reload).not.toHaveBeenCalled();

    await expect(recoverFromChunkLoadError({ force: true })).resolves.toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
