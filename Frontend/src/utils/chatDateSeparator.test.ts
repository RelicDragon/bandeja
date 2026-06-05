import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { ChatMessage } from '@/api/chat';
import {
  formatChatDateSeparatorLabel,
  getChatDateSeparatorLabel,
  shouldShowChatDateSeparator,
  stripDateSeparatorFromMeasuredRowHeight,
  CHAT_DATE_SEPARATOR_ESTIMATE_PX,
} from './chatDateSeparator';

function msg(id: string, createdAt: string): ChatMessage {
  return {
    id,
    chatContextType: 'GROUP',
    contextId: 'c1',
    senderId: 'u1',
    content: '',
    mediaUrls: [],
    thumbnailUrls: [],
    mentionIds: [],
    state: 'SENT',
    chatType: 'PUBLIC',
    createdAt,
    updatedAt: createdAt,
    sender: null,
    reactions: [],
    readReceipts: [],
  };
}

describe('shouldShowChatDateSeparator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-03T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows for the first message', () => {
    const messages = [msg('a', '2026-06-03T10:00:00Z')];
    expect(shouldShowChatDateSeparator(messages, 0)).toBe(true);
  });

  it('shows when calendar day changes', () => {
    const messages = [
      msg('a', '2026-06-01T10:00:00'),
      msg('b', '2026-06-02T10:00:00'),
    ];
    expect(shouldShowChatDateSeparator(messages, 1)).toBe(true);
  });

  it('hides when same calendar day', () => {
    const messages = [
      msg('a', '2026-06-03T10:00:00Z'),
      msg('b', '2026-06-03T18:00:00Z'),
    ];
    expect(shouldShowChatDateSeparator(messages, 1)).toBe(false);
  });
});

describe('formatChatDateSeparatorLabel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-03T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns Today for today', () => {
    expect(formatChatDateSeparatorLabel('2026-06-03T08:00:00Z')).toBe('Today');
  });

  it('returns Yesterday for yesterday', () => {
    expect(formatChatDateSeparatorLabel('2026-06-02T08:00:00Z')).toBe('Yesterday');
  });

  it('returns empty string for invalid dates', () => {
    expect(formatChatDateSeparatorLabel('not-a-date')).toBe('');
  });
});

describe('getChatDateSeparatorLabel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-03T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null when separator should not show', () => {
    const messages = [
      msg('a', '2026-06-03T10:00:00Z'),
      msg('b', '2026-06-03T18:00:00Z'),
    ];
    expect(getChatDateSeparatorLabel(messages, 1)).toBeNull();
  });

  it('returns null for invalid createdAt even on first row', () => {
    expect(getChatDateSeparatorLabel([msg('a', 'bad')], 0)).toBeNull();
  });
});

describe('stripDateSeparatorFromMeasuredRowHeight', () => {
  it('subtracts separator height when present', () => {
    expect(stripDateSeparatorFromMeasuredRowHeight(128, true)).toBe(128 - CHAT_DATE_SEPARATOR_ESTIMATE_PX);
  });

  it('leaves height unchanged when separator absent', () => {
    expect(stripDateSeparatorFromMeasuredRowHeight(88, false)).toBe(88);
  });
});
