import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@/api/chat';
import {
  ROW_ESTIMATE_IMAGE_PX,
  ROW_ESTIMATE_PX,
  ROW_ESTIMATE_VIDEO_PX,
  estimateMessageRowHeightPx,
} from '../chatMessageRowEstimate';

function msg(partial: Partial<ChatMessage> & Pick<ChatMessage, 'id'>): ChatMessage {
  return {
    chatContextType: 'GROUP',
    contextId: 'c1',
    senderId: 'u1',
    content: '',
    mediaUrls: [],
    thumbnailUrls: [],
    mentionIds: [],
    state: 'SENT',
    chatType: 'PUBLIC',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    sender: null,
    reactions: [],
    readReceipts: [],
    ...partial,
  };
}

describe('estimateMessageRowHeightPx', () => {
  it('uses large estimate for single image-only messages', () => {
    const m = msg({
      id: 'img1',
      messageType: 'IMAGE',
      mediaUrls: ['https://example.com/a.jpg'],
    });
    expect(estimateMessageRowHeightPx(m)).toBe(ROW_ESTIMATE_IMAGE_PX);
  });

  it('uses video estimate for video messages', () => {
    expect(estimateMessageRowHeightPx(msg({ id: 'v1', messageType: 'VIDEO' }))).toBe(ROW_ESTIMATE_VIDEO_PX);
  });

  it('uses default for plain text', () => {
    expect(estimateMessageRowHeightPx(msg({ id: 't1', content: 'hi', messageType: 'TEXT' }))).toBe(ROW_ESTIMATE_PX);
  });
});
