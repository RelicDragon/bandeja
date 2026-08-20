import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '@/api/chat';

const getChatMessageById = vi.fn();
const persistChatMessagesFromApiDirect = vi.fn();

vi.mock('@/api/chat', () => ({
  chatApi: {
    getChatMessageById: (...args: unknown[]) => getChatMessageById(...args),
  },
}));

vi.mock('./chatLocalApplyWrite', () => ({
  persistChatMessagesFromApiDirect: (...args: unknown[]) => persistChatMessagesFromApiDirect(...args),
}));

import { recoverEmptyMediaMessages } from './chatMediaReopenRecover';

function image(urls: string[]): ChatMessage {
  return {
    id: 'photo-1',
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

describe('recoverEmptyMediaMessages', () => {
  beforeEach(() => {
    getChatMessageById.mockReset();
    persistChatMessagesFromApiDirect.mockReset();
  });

  it('repersists the photo when reopen GET returns media', async () => {
    const recovered = image(['https://cdn.example/a.jpg']);
    getChatMessageById.mockResolvedValue(recovered);
    persistChatMessagesFromApiDirect.mockResolvedValue(undefined);

    await recoverEmptyMediaMessages([image([])]);

    expect(getChatMessageById).toHaveBeenCalledWith('photo-1');
    expect(persistChatMessagesFromApiDirect).toHaveBeenCalledWith([recovered]);
  });

  it('keeps the tombstone when GET is empty or 404', async () => {
    getChatMessageById.mockRejectedValue(Object.assign(new Error('missing'), { status: 404 }));
    await recoverEmptyMediaMessages([image([])]);
    expect(persistChatMessagesFromApiDirect).not.toHaveBeenCalled();

    getChatMessageById.mockResolvedValue(image([]));
    await recoverEmptyMediaMessages([image([])]);
    expect(persistChatMessagesFromApiDirect).not.toHaveBeenCalled();
  });

  it('skips messages that already have media', async () => {
    await recoverEmptyMediaMessages([image(['https://cdn.example/a.jpg'])]);
    expect(getChatMessageById).not.toHaveBeenCalled();
  });
});
