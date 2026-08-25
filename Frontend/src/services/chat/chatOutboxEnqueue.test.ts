import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerOutboxEnqueue, waitForOutboxReady } from './chatOutboxEnqueue';

vi.mock('@/services/chatMessageQueueStorage', () => ({
  messageQueueStorage: {
    getByTempId: vi.fn(),
  },
}));

vi.mock('@/services/chat/chatOutboxMediaBlobs', () => ({
  loadOutboxVideoBlob: vi.fn(),
}));

import { messageQueueStorage } from '@/services/chatMessageQueueStorage';
import { loadOutboxVideoBlob } from '@/services/chat/chatOutboxMediaBlobs';

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

  it('waitForOutboxReady waits for pending video blob', async () => {
    registerOutboxEnqueue('opt-v', Promise.resolve());
    vi.mocked(messageQueueStorage.getByTempId).mockResolvedValue({
      tempId: 'opt-v',
      contextType: 'GROUP',
      contextId: 'g1',
      status: 'queued',
      hasPendingVideoBlob: true,
      payload: { content: '', chatType: 'PUBLIC', messageType: 'VIDEO' },
      createdAt: new Date().toISOString(),
    } as never);
    vi.mocked(loadOutboxVideoBlob)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValue(new Blob([new Uint8Array([1])], { type: 'video/mp4' }));

    await expect(waitForOutboxReady('opt-v', 500)).resolves.toBe(true);
    expect(loadOutboxVideoBlob).toHaveBeenCalled();
  });

  it('waitForOutboxReady returns false when row never appears', async () => {
    registerOutboxEnqueue('opt-2', Promise.resolve());
    vi.mocked(messageQueueStorage.getByTempId).mockResolvedValue(undefined);
    await expect(waitForOutboxReady('opt-2', 120)).resolves.toBe(false);
  });
});
