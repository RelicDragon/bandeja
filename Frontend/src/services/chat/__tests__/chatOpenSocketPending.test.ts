import { beforeEach, describe, expect, it } from 'vitest';
import type { ChatRoomEvent } from '@/store/socketEventsStore';
import {
  appendChatRoomPending,
  clearChatRoomPending,
  peekChatRoomPending,
  takeChatRoomPending,
} from '../chatOpenSocketPending';
import {
  canFlushLiveSocketEvents,
  commitThreadOpenPaint,
  resetThreadOpenPaint,
} from '../threadOpen';

const ROOM_KEY = 'USER:thread-1';
const TAIL_KEY = 'USER:thread-1';

function messageEvent(id: string): ChatRoomEvent {
  return {
    kind: 'message',
    data: {
      contextType: 'USER',
      contextId: 'thread-1',
      messageId: id,
      message: {
        id,
        chatContextType: 'USER',
        contextId: 'thread-1',
        senderId: 'other',
        content: id,
        state: 'SENT',
        chatType: 'PUBLIC',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        reactions: [],
        readReceipts: [],
      },
    },
  };
}

function simulateFlush(
  currentId: string | undefined,
  contextId: string,
  processed: ChatRoomEvent[][]
): boolean {
  if (currentId !== contextId) return false;
  if (!canFlushLiveSocketEvents(TAIL_KEY)) return false;
  const batch = takeChatRoomPending(ROOM_KEY);
  if (batch.length > 0) processed.push(batch);
  return true;
}

describe('chatOpenSocketPending', () => {
  beforeEach(() => {
    clearChatRoomPending(ROOM_KEY);
    resetThreadOpenPaint(TAIL_KEY);
  });

  it('retains queued batches until live flush is allowed', () => {
    appendChatRoomPending(ROOM_KEY, [messageEvent('m1')]);
    expect(peekChatRoomPending(ROOM_KEY)).toHaveLength(1);
    expect(canFlushLiveSocketEvents(TAIL_KEY)).toBe(false);

    const processed: ChatRoomEvent[][] = [];
    expect(simulateFlush('thread-1', 'thread-1', processed)).toBe(false);
    expect(peekChatRoomPending(ROOM_KEY)).toHaveLength(1);
    expect(processed).toHaveLength(0);

    commitThreadOpenPaint(TAIL_KEY);
    expect(simulateFlush('thread-1', 'thread-1', processed)).toBe(true);
    expect(peekChatRoomPending(ROOM_KEY)).toHaveLength(0);
    expect(processed).toEqual([[messageEvent('m1')]]);
  });

  it('preserves pending across slow settle when paint already committed', () => {
    commitThreadOpenPaint(TAIL_KEY);
    appendChatRoomPending(ROOM_KEY, [messageEvent('m2'), messageEvent('m3')]);

    const processed: ChatRoomEvent[][] = [];
    expect(simulateFlush('thread-1', 'thread-1', processed)).toBe(true);
    expect(processed[0]?.map((e) => e.kind)).toEqual(['message', 'message']);
  });

  it('concatenates batches appended before flush', () => {
    commitThreadOpenPaint(TAIL_KEY);
    appendChatRoomPending(ROOM_KEY, [messageEvent('a')]);
    appendChatRoomPending(ROOM_KEY, [messageEvent('b')]);

    const processed: ChatRoomEvent[][] = [];
    simulateFlush('thread-1', 'thread-1', processed);
    expect(processed[0]).toHaveLength(2);
  });

  it('clears pending on room leave', () => {
    appendChatRoomPending(ROOM_KEY, [messageEvent('gone')]);
    clearChatRoomPending(ROOM_KEY);
    expect(peekChatRoomPending(ROOM_KEY)).toHaveLength(0);
  });
});
