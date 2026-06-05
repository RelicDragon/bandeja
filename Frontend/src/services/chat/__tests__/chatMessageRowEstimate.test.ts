import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@/api/chat';
import { CHAT_DATE_SEPARATOR_ESTIMATE_PX } from '@/utils/chatDateSeparator';
import {
  ROW_ESTIMATE_IMAGE_PX,
  ROW_ESTIMATE_PX,
  ROW_ESTIMATE_VIDEO_PX,
  estimateMessageRowHeightPx,
  resolveMessageRowEstimateWithDateSeparator,
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

describe('resolveMessageRowEstimateWithDateSeparator', () => {
  it('adds separator height on first row', () => {
    const messages = [msg({ id: 't1', content: 'hi', createdAt: '2026-06-01T10:00:00' })];
    expect(resolveMessageRowEstimateWithDateSeparator(messages, 0)).toBe(
      ROW_ESTIMATE_PX + CHAT_DATE_SEPARATOR_ESTIMATE_PX,
    );
  });

  it('skips separator height on same-day follow-up', () => {
    const messages = [
      msg({ id: 't1', content: 'a', createdAt: '2026-06-01T10:00:00' }),
      msg({ id: 't2', content: 'b', createdAt: '2026-06-01T11:00:00' }),
    ];
    expect(resolveMessageRowEstimateWithDateSeparator(messages, 1)).toBe(ROW_ESTIMATE_PX);
  });
});
