import { describe, expect, it, vi } from 'vitest';
import {
  isNonRetriableCancelError,
  isRetriableMessageCreateError,
  withMessageCreateRetry,
} from './chatHttpRetry';

describe('isNonRetriableCancelError', () => {
  it('detects AbortError and axios cancel codes', () => {
    expect(isNonRetriableCancelError(new DOMException('Aborted', 'AbortError'))).toBe(true);
    expect(isNonRetriableCancelError({ code: 'ERR_CANCELED', name: 'CanceledError' })).toBe(true);
    expect(isNonRetriableCancelError({ code: 'ERR_NETWORK' })).toBe(false);
  });
});

describe('isRetriableMessageCreateError', () => {
  it('does not retry cancelled requests', () => {
    expect(isRetriableMessageCreateError({ code: 'ERR_CANCELED', name: 'CanceledError' })).toBe(false);
  });

  it('still retries 503', () => {
    expect(isRetriableMessageCreateError({ response: { status: 503 } })).toBe(true);
  });
});

describe('withMessageCreateRetry', () => {
  it('does not retry after ERR_CANCELED', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ code: 'ERR_CANCELED', name: 'CanceledError' })
      .mockResolvedValueOnce({ id: 'ok' });

    await expect(withMessageCreateRetry(fn, 3)).rejects.toMatchObject({ code: 'ERR_CANCELED' });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
