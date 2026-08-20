import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BUG_CREATE_REQUEST_TIMEOUT_MS, withTimeout } from './bugCreateTimeout';
import { BUG_CREATE_PLATFORM_INFO_TIMEOUT_MS } from './bugCreatePlatformInfo';

describe('withTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves when the promise settles first', async () => {
    await expect(withTimeout(Promise.resolve(42), 5_000)).resolves.toBe(42);
  });

  it('rejects when the timeout wins', async () => {
    const pending = withTimeout(new Promise(() => undefined), 1_000);
    const assertion = expect(pending).rejects.toThrow('timeout');
    await vi.advanceTimersByTimeAsync(1_100);
    await assertion;
  });

  it('rejects with the original error when the promise fails first', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 5_000)).rejects.toThrow('boom');
  });

  it('gives createBug more than the global 10s axios budget', () => {
    expect(BUG_CREATE_REQUEST_TIMEOUT_MS).toBe(20_000);
    expect(BUG_CREATE_REQUEST_TIMEOUT_MS).toBeGreaterThan(BUG_CREATE_PLATFORM_INFO_TIMEOUT_MS);
  });
});
