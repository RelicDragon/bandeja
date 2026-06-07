import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockListOutbox = vi.fn();
const mockListMutations = vi.fn();
const mockFlushOutbox = vi.fn();
const mockFlushMutation = vi.fn();
const mockCanFlush = vi.fn();
const mockCountFailedOutbox = vi.fn();
const mockCountFailedMutations = vi.fn();

vi.mock('./outboxAdapter', () => ({
  listPendingOutboxIntents: (...args: unknown[]) => mockListOutbox(...args),
  flushOutboxIntent: (...args: unknown[]) => mockFlushOutbox(...args),
  countFailedOutboxForContext: (...args: unknown[]) => mockCountFailedOutbox(...args),
}));

vi.mock('./mutationAdapter', () => ({
  listPendingMutationIntents: (...args: unknown[]) => mockListMutations(...args),
  flushMutationIntent: (...args: unknown[]) => mockFlushMutation(...args),
  canFlushMutations: () => mockCanFlush(),
  dispatchMutationFlushDone: vi.fn(),
  countFailedMutationsForContext: (...args: unknown[]) => mockCountFailedMutations(...args),
}));

vi.mock('../chatBackgroundSyncRegister', () => ({
  requestChatOfflineBackgroundSync: vi.fn(),
}));

import { OfflineIntent } from './index';
import { flushOfflineIntents } from './flush';

describe('OfflineIntent.flush', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanFlush.mockReturnValue(true);
    mockFlushOutbox.mockResolvedValue(undefined);
    mockFlushMutation.mockResolvedValue(undefined);
  });

  it('drains per-thread in createdAt order across outbox and mutations', async () => {
    mockListOutbox.mockResolvedValue([
      {
        source: 'outbox',
        id: 'send-late',
        contextType: 'USER',
        contextId: 'c1',
        createdAtMs: 200,
      },
    ]);
    mockListMutations.mockResolvedValue([
      {
        source: 'mutation',
        id: 'mut-early',
        contextType: 'USER',
        contextId: 'c1',
        createdAtMs: 100,
      },
    ]);

    await flushOfflineIntents();

    const order = [...mockFlushMutation.mock.invocationCallOrder, ...mockFlushOutbox.mock.invocationCallOrder].sort(
      (a, b) => a - b
    );
    expect(order[0]).toBe(mockFlushMutation.mock.invocationCallOrder[0]);
    expect(mockFlushMutation).toHaveBeenCalledWith('mut-early');
    expect(mockFlushOutbox).toHaveBeenCalledWith('send-late');
  });

  it('skips flush when offline', async () => {
    mockCanFlush.mockReturnValue(false);
    await flushOfflineIntents();
    expect(mockListOutbox).not.toHaveBeenCalled();
    expect(mockListMutations).not.toHaveBeenCalled();
  });
});

describe('OfflineIntent.status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCountFailedOutbox.mockResolvedValue(2);
    mockCountFailedMutations.mockResolvedValue(1);
  });

  it('returns hybrid failed counts for a context', async () => {
    const status = await OfflineIntent.status({ contextType: 'GAME', contextId: 'g1' });
    expect(status).toEqual({ failedSends: 2, failedMutations: 1 });
    expect(mockCountFailedOutbox).toHaveBeenCalledWith('GAME', 'g1');
    expect(mockCountFailedMutations).toHaveBeenCalledWith('GAME', 'g1');
  });
});
