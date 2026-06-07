import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockListPending = vi.fn();
const mockFlushOutbox = vi.fn();

vi.mock('./offlineIntent/outboxAdapter', () => ({
  listPendingOutboxIntents: (...args: unknown[]) => mockListPending(...args),
  flushOutboxIntent: (...args: unknown[]) => mockFlushOutbox(...args),
}));

import { retryFailedChatOutbox } from './chatOutboxRetry';

describe('retryFailedChatOutbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFlushOutbox.mockResolvedValue(undefined);
  });

  it('passes includeFailed false to adapter and flushes pending intents', async () => {
    mockListPending.mockResolvedValue([
      { source: 'outbox', id: 'a', contextType: 'USER', contextId: 'c1', createdAtMs: 1 },
    ]);

    await retryFailedChatOutbox({ includeFailed: false });

    expect(mockListPending).toHaveBeenCalledWith({ includeFailedOutbox: false });
    expect(mockFlushOutbox).toHaveBeenCalledTimes(1);
    expect(mockFlushOutbox).toHaveBeenCalledWith('a');
  });

  it('includes failed rows when includeFailed is true', async () => {
    mockListPending.mockResolvedValue([
      { source: 'outbox', id: 'b', contextType: 'USER', contextId: 'c1', createdAtMs: 1 },
    ]);

    await retryFailedChatOutbox({ includeFailed: true });

    expect(mockListPending).toHaveBeenCalledWith({ includeFailedOutbox: true });
    expect(mockFlushOutbox).toHaveBeenCalledWith('b');
  });
});
