import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withTimeout } from './bugCreateTimeout';

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
});
