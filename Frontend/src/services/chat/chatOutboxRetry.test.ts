import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockToArray = vi.fn();
const mockUpdateStatus = vi.fn();
const mockSendWithTimeout = vi.fn();
const mockIsSending = vi.fn();

vi.mock('./chatLocalDb', () => ({
  chatLocalDb: {
    outbox: { toArray: () => mockToArray() },
  },
}));

vi.mock('@/services/chatMessageQueueStorage', () => ({
  messageQueueStorage: {
    updateStatus: (...args: unknown[]) => mockUpdateStatus(...args),
    remove: vi.fn(),
  },
}));

vi.mock('@/services/chatSendService', () => ({
  sendWithTimeout: (...args: unknown[]) => mockSendWithTimeout(...args),
  isSending: (id: string) => mockIsSending(id),
  cancelSend: vi.fn(),
}));

vi.mock('./chatOutboxExpiry', () => ({
  purgeExpiredFailedOutbox: vi.fn().mockResolvedValue(0),
}));

vi.mock('./chatLocalApply', () => ({
  putLocalMessage: vi.fn(),
}));

import { retryFailedChatOutbox } from './chatOutboxRetry';

describe('retryFailedChatOutbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsSending.mockReturnValue(false);
    mockUpdateStatus.mockResolvedValue(undefined);
  });

  it('resumes queued and sending rows when includeFailed is false', async () => {
    mockToArray.mockResolvedValue([
      {
        tempId: 'a',
        status: 'sending',
        contextType: 'USER',
        contextId: 'c1',
        payload: { content: 'x', chatType: 'PUBLIC' },
      },
      {
        tempId: 'b',
        status: 'failed',
        contextType: 'USER',
        contextId: 'c1',
        payload: { content: 'y', chatType: 'PUBLIC' },
      },
    ]);

    await retryFailedChatOutbox({ includeFailed: false });

    expect(mockUpdateStatus).toHaveBeenCalledTimes(1);
    expect(mockUpdateStatus).toHaveBeenCalledWith('a', 'USER', 'c1', 'queued');
    expect(mockSendWithTimeout).toHaveBeenCalledTimes(1);
  });

  it('includes failed rows when includeFailed is true', async () => {
    mockToArray.mockResolvedValue([
      {
        tempId: 'b',
        status: 'failed',
        contextType: 'USER',
        contextId: 'c1',
        payload: { content: 'y', chatType: 'PUBLIC' },
      },
    ]);

    await retryFailedChatOutbox({ includeFailed: true });

    expect(mockSendWithTimeout).toHaveBeenCalledTimes(1);
  });
});
