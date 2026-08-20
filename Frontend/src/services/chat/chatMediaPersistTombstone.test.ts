import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@/api/chat';
import {
  isDurableMediaPersist,
  isEmptyMediaMessage,
  mediaUrlCount,
  shouldTombstoneMedia,
  toMediaTombstone,
} from './chatMediaPersistTombstone';

function image(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm1',
    chatContextType: 'USER',
    contextId: 'u1',
    senderId: 's1',
    content: '',
    mediaUrls: ['https://cdn.example/photo.jpg'],
    thumbnailUrls: ['https://cdn.example/thumb.jpg'],
    mentionIds: [],
    state: 'SENT',
    chatType: 'PUBLIC',
    messageType: 'IMAGE',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    sender: null,
    reactions: [],
    readReceipts: [],
    ...overrides,
  };
}

describe('chatMediaPersistTombstone', () => {
  it('counts media and thumbnail urls', () => {
    expect(mediaUrlCount(image())).toBe(2);
    expect(mediaUrlCount(image({ mediaUrls: [], thumbnailUrls: [] }))).toBe(0);
  });

  it('tombstones image payloads to durable empty urls', () => {
    const tombstone = toMediaTombstone(image());
    expect(tombstone.mediaUrls).toEqual([]);
    expect(tombstone.thumbnailUrls).toEqual([]);
    expect(tombstone.messageType).toBe('IMAGE');
    expect(isEmptyMediaMessage(tombstone)).toBe(true);
  });

  it('does not treat plain text as empty media', () => {
    const text = image({ messageType: 'TEXT', mediaUrls: [], thumbnailUrls: [] });
    expect(isEmptyMediaMessage(text)).toBe(false);
    expect(shouldTombstoneMedia(text)).toBe(false);
  });

  it('treats full media and empty image tombstones as durable persists', () => {
    expect(isDurableMediaPersist(image())).toBe(true);
    expect(isDurableMediaPersist(toMediaTombstone(image()))).toBe(true);
    expect(
      isDurableMediaPersist(image({ messageType: 'TEXT', mediaUrls: [], thumbnailUrls: [] }))
    ).toBe(false);
  });
});
