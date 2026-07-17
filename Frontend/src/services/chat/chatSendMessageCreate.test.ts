import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createMessage, waitForChatSendSocketAck } = vi.hoisted(() => ({
  createMessage: vi.fn(),
  waitForChatSendSocketAck: vi.fn(),
}));

vi.mock('@/store/authStore', () => ({
  useAuthStore: {
    getState: () => ({ user: { id: 'user-1' } }),
  },
}));

vi.mock('@/api/chat', () => ({
  chatApi: {
    createMessage: (...args: unknown[]) => createMessage(...args),
  },
}));

vi.mock('@/services/chat/chatSendMetrics', () => ({
  recordChatSendMetric: vi.fn(),
}));

vi.mock('./chatSendSocketAck', () => ({
  waitForChatSendSocketAck: (...args: unknown[]) => waitForChatSendSocketAck(...args),
}));

import type { ChatMessage, CreateMessageRequest } from '@/api/chat';
import { recordChatSendMetric } from '@/services/chat/chatSendMetrics';
import { createMessageWithSocketAck } from './chatSendMessageCreate';

function serverMessage(id: string, clientMutationId: string): ChatMessage {
  return {
    id,
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
  } as unknown as ChatMessage;
}

const request = {
  chatContextType: 'GAME',
  contextId: 'game-1',
  content: 'hi',
  clientMutationId: 'cid-race',
} as CreateMessageRequest;

describe('createMessageWithSocketAck', () => {
  beforeEach(() => {
    createMessage.mockReset();
    waitForChatSendSocketAck.mockReset();
    vi.mocked(recordChatSendMetric).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns socket message and aborts HTTP when ack wins', async () => {
    const socketMsg = serverMessage('srv-socket', 'cid-race');
    waitForChatSendSocketAck.mockResolvedValue(socketMsg);

    let httpSignal: AbortSignal | undefined;
    createMessage.mockImplementation((_req: CreateMessageRequest, opts?: { signal?: AbortSignal }) => {
      httpSignal = opts?.signal;
      return new Promise((_resolve, reject) => {
        const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
        if (opts?.signal?.aborted) {
          onAbort();
          return;
        }
        opts?.signal?.addEventListener('abort', onAbort, { once: true });
      });
    });

    await expect(
      createMessageWithSocketAck(request, 'GAME', 'game-1', 'cid-race', undefined, 'temp-1')
    ).resolves.toEqual(socketMsg);

    expect(httpSignal?.aborted).toBe(true);
    expect(createMessage).toHaveBeenCalledOnce();
    expect(waitForChatSendSocketAck).toHaveBeenCalledWith(
      expect.objectContaining({
        contextType: 'GAME',
        contextId: 'game-1',
        clientMutationId: 'cid-race',
      })
    );
    expect(recordChatSendMetric).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'chat_send_socket_ack', tempId: 'temp-1' })
    );
  });

  it('returns immediately when socket wins even if HTTP ignores abort', async () => {
    const socketMsg = serverMessage('srv-socket', 'cid-race');
    waitForChatSendSocketAck.mockResolvedValue(socketMsg);
    createMessage.mockImplementation(() => new Promise(() => undefined));

    await expect(
      createMessageWithSocketAck(request, 'GAME', 'game-1', 'cid-race', undefined, 'temp-1')
    ).resolves.toEqual(socketMsg);
  });

  it('falls back to HTTP when socket ack times out', async () => {
    vi.useFakeTimers();
    waitForChatSendSocketAck.mockResolvedValue(null);
    createMessage.mockResolvedValue(serverMessage('srv-http', 'cid-race'));

    const p = createMessageWithSocketAck(
      request,
      'GAME',
      'game-1',
      'cid-race',
      undefined,
      'temp-1'
    );

    vi.advanceTimersByTime(15_000);
    await expect(p).resolves.toEqual(expect.objectContaining({ id: 'srv-http' }));
    expect(createMessage).toHaveBeenCalledOnce();
  });
});
