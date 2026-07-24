import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { raceAbort, withTimeout } from './chatVideoAsyncTimeout';

describe('withTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves when promise wins and clears timer', async () => {
    const pending = withTimeout(Promise.resolve(42), 5_000, 'timeout');
    await expect(pending).resolves.toBe(42);
  });

  it('rejects with code when timeout wins', async () => {
    const pending = withTimeout(new Promise(() => undefined), 1_000, 'video_transcode_failed');
    const assertion = expect(pending).rejects.toThrow('video_transcode_failed');
    await vi.advanceTimersByTimeAsync(1_100);
    await assertion;
  });
});

describe('raceAbort', () => {
  it('rejects when signal aborts before settle', async () => {
    const ac = new AbortController();
    const pending = raceAbort(new Promise(() => undefined), ac.signal);
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    ac.abort();
    await assertion;
  });

  it('resolves when promise wins', async () => {
    const ac = new AbortController();
    await expect(raceAbort(Promise.resolve('ok'), ac.signal)).resolves.toBe('ok');
  });
});
