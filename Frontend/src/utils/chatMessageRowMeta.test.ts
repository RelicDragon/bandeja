import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@/api/chat';
import { buildChatMessageRowMeta } from './chatMessageRowMeta';
import { getChatDateSeparatorLabel } from './chatDateSeparator';
import { getMessageGroupPosition } from './chatMessageGrouping';

function msg(id: string, senderId: string | null, createdAt: string): ChatMessage {
  return { id, senderId, createdAt } as unknown as ChatMessage;
}

/** Same ordering the thread uses: ascending by createdAt. */
const MESSAGES: ChatMessage[] = [
  msg('a', 'u1', '2026-03-01T10:00:00.000Z'),
  msg('b', 'u1', '2026-03-01T10:01:00.000Z'),
  msg('c', 'u1', '2026-03-01T10:02:00.000Z'),
  // > 4 min gap breaks the group
  msg('d', 'u1', '2026-03-01T10:30:00.000Z'),
  msg('e', 'u2', '2026-03-01T10:31:00.000Z'),
  // system message (no sender) never groups
  msg('f', null, '2026-03-01T10:32:00.000Z'),
  msg('g', 'u2', '2026-03-01T10:33:00.000Z'),
  // next calendar day → separator
  msg('h', 'u2', '2026-03-02T09:00:00.000Z'),
  msg('i', 'u2', '2026-03-02T09:01:00.000Z'),
  // unparseable timestamp
  msg('j', 'u2', 'not-a-date'),
];

describe('buildChatMessageRowMeta', () => {
  it('matches the per-row helpers it replaces', () => {
    const meta = buildChatMessageRowMeta(MESSAGES);

    for (let i = 0; i < MESSAGES.length; i++) {
      expect(meta.groupPositions[i]).toBe(getMessageGroupPosition(MESSAGES, i));
      expect(meta.dateSeparatorLabels[i]).toBe(getChatDateSeparatorLabel(MESSAGES, i));
    }
  });

  it('groups a same-sender run inside the window', () => {
    const meta = buildChatMessageRowMeta(MESSAGES);
    expect(meta.groupPositions.slice(0, 3)).toEqual(['first', 'middle', 'last']);
  });

  it('never groups across a sender change or a system message', () => {
    const meta = buildChatMessageRowMeta(MESSAGES);
    expect(meta.groupPositions[4]).toBe('single'); // u2 after u1
    expect(meta.groupPositions[5]).toBe('single'); // system row
    expect(meta.groupPositions[6]).toBe('single'); // u2 after system row
  });

  it('emits a separator on the first row and on each new calendar day only', () => {
    const meta = buildChatMessageRowMeta(MESSAGES);
    expect(meta.dateSeparatorLabels[0]).toBeTruthy();
    expect(meta.dateSeparatorLabels[1]).toBeNull();
    expect(meta.dateSeparatorLabels[7]).toBeTruthy();
    expect(meta.dateSeparatorLabels[8]).toBeNull();
  });

  it('handles an empty list', () => {
    const meta = buildChatMessageRowMeta([]);
    expect(meta.groupPositions).toEqual([]);
    expect(meta.dateSeparatorLabels).toEqual([]);
  });
});
