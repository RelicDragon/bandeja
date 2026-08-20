import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '@/api/chat';

const putLocalMessageDirect = vi.fn();
const putChatLocalRowsWithSearchTokens = vi.fn();

vi.mock('./chatLocalApplyWrite', () => ({
  putLocalMessageDirect: (...args: unknown[]) => putLocalMessageDirect(...args),
  putChatLocalRowsWithSearchTokens: (...args: unknown[]) => putChatLocalRowsWithSearchTokens(...args),
}));

vi.mock('./chatSyncRowUtils', () => ({
  rowFromMessage: (message: ChatMessage) => ({ id: message.id, payload: message }),
}));

import { persistLocalMessageDurable, persistCreatedEventMediaTombstones } from './chatLocalApplyPersistMessage';

function image(): ChatMessage {
  return {
    id: 'photo-1',
    chatContextType: 'USER',
    contextId: 'u1',
    senderId: 's1',
    content: '',
    mediaUrls: ['https://cdn.example/a.jpg'],
    thumbnailUrls: ['https://cdn.example/t.jpg'],
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

describe('persistLocalMessageDurable', () => {
  beforeEach(() => {
    putLocalMessageDirect.mockReset();
    putChatLocalRowsWithSearchTokens.mockReset();
  });

  it('persists the full image when Dexie write succeeds', async () => {
    putLocalMessageDirect.mockResolvedValue(undefined);
    const message = image();
    await persistLocalMessageDurable(message);
    expect(putLocalMessageDirect).toHaveBeenCalledTimes(1);
    expect(putLocalMessageDirect).toHaveBeenCalledWith(message);
  });

  it('writes a media tombstone when full image persist fails', async () => {
    putLocalMessageDirect
      .mockRejectedValueOnce(new Error('dexie write failed'))
      .mockResolvedValueOnce(undefined);
    const message = image();
    await persistLocalMessageDurable(message);
    expect(putLocalMessageDirect).toHaveBeenCalledTimes(2);
    expect(putLocalMessageDirect.mock.calls[1]?.[0]).toEqual({
      ...message,
      mediaUrls: [],
      thumbnailUrls: [],
    });
  });

  it('rethrows when text persist fails', async () => {
    putLocalMessageDirect.mockRejectedValue(new Error('dexie write failed'));
    const text: ChatMessage = { ...image(), messageType: 'TEXT', mediaUrls: [], thumbnailUrls: [] };
    await expect(persistLocalMessageDurable(text)).rejects.toThrow('dexie write failed');
    expect(putLocalMessageDirect).toHaveBeenCalledTimes(1);
  });

  it('rethrows when media tombstone persist also fails', async () => {
    putLocalMessageDirect.mockRejectedValue(new Error('dexie write failed'));
    await expect(persistLocalMessageDurable(image())).rejects.toThrow('dexie write failed');
    expect(putLocalMessageDirect).toHaveBeenCalledTimes(2);
  });
});

describe('persistCreatedEventMediaTombstones', () => {
  beforeEach(() => {
    putChatLocalRowsWithSearchTokens.mockReset();
  });

  it('persists IMAGE creates as empty media rows', async () => {
    putChatLocalRowsWithSearchTokens.mockResolvedValue(undefined);
    const written = await persistCreatedEventMediaTombstones([
      {
        id: 'ev-10',
        seq: 10,
        eventType: 'MESSAGE_CREATED',
        createdAt: '2026-01-01T00:00:00Z',
        payload: { message: image() },
      },
    ]);
    expect(written).toEqual([expect.objectContaining({ id: 'photo-1', mediaUrls: [], thumbnailUrls: [] })]);
    expect(putChatLocalRowsWithSearchTokens).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'photo-1',
        payload: expect.objectContaining({ mediaUrls: [], thumbnailUrls: [] }),
      }),
    ]);
  });
});
