import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@/api/chat';
import { getMessageGroupPosition, MESSAGE_GROUP_WINDOW_MS } from './chatMessageGrouping';

function msg(senderId: string | null, createdAt: string): ChatMessage {
  return { senderId, createdAt } as ChatMessage;
}

const T0 = '2026-06-11T12:00:00.000Z';
const T1 = '2026-06-11T12:01:00.000Z';
const T2 = '2026-06-11T12:02:00.000Z';

describe('getMessageGroupPosition', () => {
  it('marks a lone message as single', () => {
    expect(getMessageGroupPosition([msg('a', T0)], 0)).toBe('single');
  });

  it('groups consecutive same-sender messages', () => {
    const list = [msg('a', T0), msg('a', T1), msg('a', T2)];
    expect(getMessageGroupPosition(list, 0)).toBe('first');
    expect(getMessageGroupPosition(list, 1)).toBe('middle');
    expect(getMessageGroupPosition(list, 2)).toBe('last');
  });

  it('breaks groups on sender change', () => {
    const list = [msg('a', T0), msg('b', T1), msg('b', T2)];
    expect(getMessageGroupPosition(list, 0)).toBe('single');
    expect(getMessageGroupPosition(list, 1)).toBe('first');
    expect(getMessageGroupPosition(list, 2)).toBe('last');
  });

  it('never groups system messages', () => {
    const list = [msg(null, T0), msg(null, T1)];
    expect(getMessageGroupPosition(list, 0)).toBe('single');
    expect(getMessageGroupPosition(list, 1)).toBe('single');
  });

  it('breaks groups when the time gap exceeds the window', () => {
    const later = new Date(Date.parse(T0) + MESSAGE_GROUP_WINDOW_MS + 1000).toISOString();
    const list = [msg('a', T0), msg('a', later)];
    expect(getMessageGroupPosition(list, 0)).toBe('single');
    expect(getMessageGroupPosition(list, 1)).toBe('single');
  });

  it('breaks groups on invalid dates', () => {
    const list = [msg('a', 'not-a-date'), msg('a', T0)];
    expect(getMessageGroupPosition(list, 0)).toBe('single');
    expect(getMessageGroupPosition(list, 1)).toBe('single');
  });
});
