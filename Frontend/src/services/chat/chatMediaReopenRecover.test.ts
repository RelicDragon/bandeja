import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '@/api/chat';

const getChatMessageById = vi.fn();
const persistChatMessagesFromApi = vi.fn();
const shouldQueueChatMutation = vi.hoisted(() => vi.fn(() => false));

vi.mock('@/api/chat', () => ({
  chatApi: {
    getChatMessageById: (...args: unknown[]) => getChatMessageById(...args),
  },
}));

vi.mock('./chatLocalApplyWrite', () => ({
  persistChatMessagesFromApi: (...args: unknown[]) => persistChatMessagesFromApi(...args),
}));

vi.mock('./chatMutationNetwork', () => ({
  shouldQueueChatMutation: () => shouldQueueChatMutation(),
  isRetryableMutationError: (error: unknown) => {
    if (!error || typeof error !== 'object') return true;
    const err = error as { response?: { status?: number }; code?: string };
    if (err.code === 'ECONNABORTED' || err.code === 'ERR_NETWORK') return true;
    const status = err.response?.status;
    if (status == null) return true;
    return status >= 500 || status === 408 || status === 429;
  },
}));

import {
  MAX_MEDIA_REOPEN_GETS_PER_PASS,
  recoverEmptyMediaMessages,
  resetMediaReopenRecoverForTests,
} from './chatMediaReopenRecover';

function image(id: string, urls: string[]): ChatMessage {
  return {
    id,
    chatContextType: 'USER',
    contextId: 'u1',
    senderId: 's1',
    content: '',
    mediaUrls: urls,
    thumbnailUrls: urls,
    mentionIds: [],
    state: 'SENT',
    chatType: 'PUBLIC',
    messageType: 'IMAGE',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    sender: null,
    reactions: [],
    readReceipts: [],
  };
}

function axiosError(status?: number, code?: string): Error {
  return Object.assign(new Error('request failed'), {
    isAxiosError: true,
    code,
    response: status != null ? { status } : undefined,
  });
}

describe('recoverEmptyMediaMessages', () => {
  beforeEach(() => {
    getChatMessageById.mockReset();
    persistChatMessagesFromApi.mockReset();
    shouldQueueChatMutation.mockReturnValue(false);
    resetMediaReopenRecoverForTests();
  });

  it('repersists the photo when reopen GET returns media', async () => {
    const recovered = image('photo-1', ['https://cdn.example/a.jpg']);
    getChatMessageById.mockResolvedValue(recovered);
    persistChatMessagesFromApi.mockResolvedValue(undefined);

    await recoverEmptyMediaMessages([image('photo-1', [])]);

    expect(getChatMessageById).toHaveBeenCalledWith('photo-1');
    expect(persistChatMessagesFromApi).toHaveBeenCalledWith([recovered]);
  });

  it('keeps the tombstone when GET is empty or 404', async () => {
    getChatMessageById.mockRejectedValueOnce(axiosError(404));
    await recoverEmptyMediaMessages([image('photo-404', [])]);
    expect(persistChatMessagesFromApi).not.toHaveBeenCalled();

    getChatMessageById.mockResolvedValueOnce(image('photo-empty', []));
    await recoverEmptyMediaMessages([image('photo-empty', [])]);
    expect(persistChatMessagesFromApi).not.toHaveBeenCalled();
  });

  it('does not GET the same tombstone again after a conclusive miss', async () => {
    getChatMessageById.mockRejectedValue(axiosError(404));
    await recoverEmptyMediaMessages([image('photo-1', [])]);
    await recoverEmptyMediaMessages([image('photo-1', [])]);
    expect(getChatMessageById).toHaveBeenCalledTimes(1);
  });

  it('retries after a network error', async () => {
    getChatMessageById
      .mockRejectedValueOnce(axiosError(undefined, 'ERR_NETWORK'))
      .mockResolvedValueOnce(image('photo-1', ['https://cdn.example/a.jpg']));
    persistChatMessagesFromApi.mockResolvedValue(undefined);

    await recoverEmptyMediaMessages([image('photo-1', [])]);
    await recoverEmptyMediaMessages([image('photo-1', [])]);

    expect(getChatMessageById).toHaveBeenCalledTimes(2);
    expect(persistChatMessagesFromApi).toHaveBeenCalledTimes(1);
  });

  it('caps GETs per open so a long tombstone tail cannot storm', async () => {
    getChatMessageById.mockResolvedValue(image('x', []));
    const messages = Array.from({ length: MAX_MEDIA_REOPEN_GETS_PER_PASS + 5 }, (_, i) =>
      image(`photo-${i}`, [])
    );
    await recoverEmptyMediaMessages(messages);
    expect(getChatMessageById).toHaveBeenCalledTimes(MAX_MEDIA_REOPEN_GETS_PER_PASS);
  });

  it('skips recover while offline', async () => {
    shouldQueueChatMutation.mockReturnValue(true);
    await recoverEmptyMediaMessages([image('photo-1', [])]);
    expect(getChatMessageById).not.toHaveBeenCalled();
  });

  it('does not GET again this session when persist of recovered media fails', async () => {
    getChatMessageById.mockResolvedValue(image('photo-1', ['https://cdn.example/a.jpg']));
    persistChatMessagesFromApi.mockRejectedValue(new Error('dexie write failed'));
    await recoverEmptyMediaMessages([image('photo-1', [])]);
    await recoverEmptyMediaMessages([image('photo-1', [])]);
    expect(getChatMessageById).toHaveBeenCalledTimes(1);
  });

  it('skips messages that already have media', async () => {
    await recoverEmptyMediaMessages([image('photo-1', ['https://cdn.example/a.jpg'])]);
    expect(getChatMessageById).not.toHaveBeenCalled();
  });
});
