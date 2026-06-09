import { beforeEach, describe, expect, it, vi } from 'vitest';
import { beginChatSend, isSending, resetChatSendCoordinatorForTests } from '@/services/chat/chatSendCoordinator';

const getByTempId = vi.fn();
const updateStatus = vi.fn();
const reconcileAborted = vi.fn();

vi.mock('@/services/chatMessageQueueStorage', () => ({
  messageQueueStorage: {
    getByTempId: (...args: unknown[]) => getByTempId(...args),
    updateStatus: (...args: unknown[]) => updateStatus(...args),
  },
}));

vi.mock('@/services/chat/chatOutboxReconcile', () => ({
  reconcileAbortedChatSendIfDelivered: (...args: unknown[]) => reconcileAborted(...args),
}));

describe('resumeOrFailSupersededChatSend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetChatSendCoordinatorForTests();
    updateStatus.mockResolvedValue(undefined);
    reconcileAborted.mockResolvedValue(false);
  });

  it('re-drives queued outbox row when not already sending', async () => {
    const { resumeOrFailSupersededChatSend } = await import('./chatOutboxSendResume');
    const driveSend = vi.fn();

    getByTempId.mockResolvedValue({
      tempId: 'opt-1',
      contextType: 'USER',
      contextId: 'uc-1',
      status: 'queued',
      payload: { content: 'hi', chatType: 'PUBLIC' },
      clientMutationId: 'cid-1',
    });

    const onFailed = vi.fn();
    await resumeOrFailSupersededChatSend('opt-1', 'USER', 'uc-1', onFailed, driveSend);

    expect(updateStatus).toHaveBeenCalledWith('opt-1', 'USER', 'uc-1', 'queued');
    expect(driveSend).toHaveBeenCalledTimes(1);
    expect(onFailed).not.toHaveBeenCalled();
  });

  it('skips resume when another attempt is already active', async () => {
    const { resumeOrFailSupersededChatSend } = await import('./chatOutboxSendResume');
    beginChatSend('opt-2', 'GAME', 'g-1');

    getByTempId.mockResolvedValue({
      tempId: 'opt-2',
      contextType: 'GAME',
      contextId: 'g-1',
      status: 'sending',
      payload: { content: 'x', chatType: 'PUBLIC' },
    });

    const driveSend = vi.fn();
    await resumeOrFailSupersededChatSend('opt-2', 'GAME', 'g-1', vi.fn(), driveSend);

    expect(driveSend).not.toHaveBeenCalled();
    expect(isSending('opt-2')).toBe(true);
  });
});
