import { describe, expect, it, beforeEach } from 'vitest';
import type { ChatMessageWithStatus } from '@/api/chat';
import {
  clearMessageHeightMemoryCache,
  getCachedMessageRowHeight,
  rememberMeasuredMessageHeight,
} from '../chatMessageHeights';
import { ROW_ESTIMATE_IMAGE_PX } from '../chatMessageRowEstimate';
import {
  clearChatThreadMemory,
  peekChatThreadMemory,
  putChatThreadMemory,
} from '../chatThreadMemoryCache';

function row(id: string, extra?: Partial<ChatMessageWithStatus>): ChatMessageWithStatus {
  return {
    id,
    chatContextType: 'GROUP',
    contextId: 'gc1',
    senderId: 'u1',
    content: '',
    mediaUrls: extra?.mediaUrls ?? [],
    thumbnailUrls: [],
    mentionIds: [],
    state: 'SENT',
    chatType: 'PUBLIC',
    messageType: extra?.messageType ?? 'TEXT',
    createdAt: '2026-01-03T10:00:00Z',
    updatedAt: '2026-01-03T10:00:00Z',
    sender: null,
    reactions: [],
    readReceipts: [],
    ...extra,
  };
}

describe('chatThreadMemory rowHeights', () => {
  beforeEach(() => {
    clearChatThreadMemory();
    clearMessageHeightMemoryCache();
  });

  it('stores measured heights on put and restores on peek', () => {
    const key = 'GROUP:gc1:PUBLIC';
    const image = row('img', {
      messageType: 'IMAGE',
      mediaUrls: ['https://x/y.jpg'],
    });
    rememberMeasuredMessageHeight('img', 512);
    putChatThreadMemory(key, [image]);
    clearMessageHeightMemoryCache();

    peekChatThreadMemory(key);
    expect(getCachedMessageRowHeight('img')).toBe(512);
  });

  it('stores image placeholder estimate when not measured', () => {
    const key = 'GROUP:gc1:PUBLIC';
    const image = row('img2', {
      messageType: 'IMAGE',
      mediaUrls: ['https://x/y.jpg'],
    });
    putChatThreadMemory(key, [image]);
    clearMessageHeightMemoryCache();

    peekChatThreadMemory(key);
    expect(getCachedMessageRowHeight('img2')).toBe(ROW_ESTIMATE_IMAGE_PX);
  });
});
