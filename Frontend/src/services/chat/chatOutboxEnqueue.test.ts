import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerOutboxEnqueue, waitForOutboxReady } from './chatOutboxEnqueue';

vi.mock('@/services/chatMessageQueueStorage', () => ({
  messageQueueStorage: {
    getByTempId: vi.fn(),
  },
}));

import { messageQueueStorage } from '@/services/chatMessageQueueStorage';

describe('chatOutboxEnqueue', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('waitForOutboxReady resolves when enqueue promise completes', async () => {
    let resolveAdd!: () => void;
    const addPromise = new Promise<void>((r) => {
      resolveAdd = r;
    });
    registerOutboxEnqueue('opt-1', addPromise);
    vi.mocked(messageQueueStorage.getByTempId).mockResolvedValue({
      tempId: 'opt-1',
      contextType: 'USER',
      contextId: 'c1',
      status: 'queued',
      payload: { content: 'hi', chatType: 'PUBLIC' },
      createdAt: new Date().toISOString(),
    } as never);

    const readyP = waitForOutboxReady('opt-1', 2000);
    resolveAdd();
    await expect(readyP).resolves.toBe(true);
  });

  it('waitForOutboxReady returns false when row never appears', async () => {
    registerOutboxEnqueue('opt-2', Promise.resolve());
    vi.mocked(messageQueueStorage.getByTempId).mockResolvedValue(undefined);
    await expect(waitForOutboxReady('opt-2', 120)).resolves.toBe(false);
  });
});
