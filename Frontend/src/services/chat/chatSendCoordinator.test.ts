import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  beginChatSend,
  bumpSendGeneration,
  finishChatSend,
  invalidateChatSend,
  isActiveSendGeneration,
  isSending,
  resetChatSendCoordinatorForTests,
  runWithAbort,
} from './chatSendCoordinator';

const acquireMock = vi.fn();
const releaseMock = vi.fn();

vi.mock('@/services/chat/chatSendKeepAwake', () => ({
  acquireChatSendWakeLock: () => acquireMock(),
  releaseChatSendWakeLock: () => releaseMock(),
}));

describe('chatSendCoordinator', () => {
  afterEach(() => {
    resetChatSendCoordinatorForTests();
    acquireMock.mockClear();
    releaseMock.mockClear();
  });

  it('invalidates prior generation on beginChatSend', () => {
    const first = beginChatSend('t1', 'USER', 'c1');
    expect(isActiveSendGeneration('t1', first.generation)).toBe(true);
    const second = beginChatSend('t1', 'USER', 'c1');
    expect(isActiveSendGeneration('t1', first.generation)).toBe(false);
    expect(isActiveSendGeneration('t1', second.generation)).toBe(true);
  });

  it('invalidateChatSend aborts signal and clears isSending', () => {
    const { generation, signal } = beginChatSend('t2', 'GAME', 'g1');
    expect(isSending('t2')).toBe(true);
    invalidateChatSend('t2');
    expect(signal.aborted).toBe(true);
    expect(isSending('t2')).toBe(false);
    expect(isActiveSendGeneration('t2', generation)).toBe(false);
  });

  it('runWithAbort rejects when signal is aborted', async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(runWithAbort(ac.signal, async () => 'ok')).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('bumpSendGeneration increments', () => {
    expect(bumpSendGeneration('x')).toBe(1);
    expect(bumpSendGeneration('x')).toBe(2);
  });

  it('acquires wake lock once for concurrent sends and releases when all finish', () => {
    beginChatSend('t-a', 'GAME', 'g1');
    beginChatSend('t-b', 'GAME', 'g1');
    expect(acquireMock).toHaveBeenCalledTimes(1);
    expect(releaseMock).not.toHaveBeenCalled();

    finishChatSend('t-a');
    expect(releaseMock).not.toHaveBeenCalled();

    finishChatSend('t-b');
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });
});
