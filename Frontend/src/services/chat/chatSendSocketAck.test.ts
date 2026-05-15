import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '@/api/chat';
import {
  deliverChatSendSocketAck,
  resetChatSendSocketAckForTests,
  waitForChatSendSocketAck,
} from './chatSendSocketAck';

vi.mock('@/store/authStore', () => ({
  useAuthStore: {
    getState: () => ({ user: { id: 'user-1' } }),
  },
}));

function serverMessage(clientMutationId: string): ChatMessage {
  return {
    id: 'srv-1',
    chatContextType: 'GAME',
    contextId: 'game-1',
    senderId: 'user-1',
    content: 'hello',
    state: 'SENT',
    clientMutationId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    reactions: [],
    readReceipts: [],
  } as ChatMessage;
}

describe('chatSendSocketAck', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetChatSendSocketAckForTests();
  });

  afterEach(() => {
    resetChatSendSocketAckForTests();
    vi.useRealTimers();
  });

  it('resolves when matching socket message arrives', async () => {
    const p = waitForChatSendSocketAck({
      contextType: 'GAME',
      contextId: 'game-1',
      clientMutationId: 'cid-1',
      timeoutMs: 5000,
    });
    const delivered = deliverChatSendSocketAck('GAME', 'game-1', serverMessage('cid-1'));
    expect(delivered).toBe(true);
    await expect(p).resolves.toEqual(expect.objectContaining({ id: 'srv-1' }));
  });

  it('ignores messages for other mutation ids', async () => {
    const p = waitForChatSendSocketAck({
      contextType: 'GAME',
      contextId: 'game-1',
      clientMutationId: 'cid-1',
      timeoutMs: 100,
    });
    deliverChatSendSocketAck('GAME', 'game-1', serverMessage('other'));
    vi.advanceTimersByTime(100);
    await expect(p).resolves.toBeNull();
  });
});
