import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ChatMessageWithStatus } from '@/api/chat';
import { ChatThreadController } from '../ChatThreadController';
import { openThread } from '@/services/chat/threadOpen';
import { cancelAllForContext } from '@/services/chatSendService';
import { reconcileThreadIndexOutboxForContext } from '@/services/chat/chatThreadIndex';
import {
  enterContextAndMarkRead,
  markContextReadOnUserActivity,
} from '@/services/chat/unreadCoordinator';

vi.mock('@/services/chatSendService', () => ({
  cancelAllForContext: vi.fn(),
}));

vi.mock('@/services/chat/chatThreadIndex', () => ({
  reconcileThreadIndexOutboxForContext: vi.fn(async () => {}),
}));

vi.mock('@/services/chat/unreadCoordinator', () => ({
  enterContextAndMarkRead: vi.fn(async () => {}),
  markContextReadOnUserActivity: vi.fn(),
}));

vi.mock('@/services/chat/threadOpen/openThread', () => ({
  openThread: vi.fn(),
}));

function msg(id: string): ChatMessageWithStatus {
  return {
    id,
    chatContextType: 'USER',
    contextId: 'uc1',
    senderId: 'u1',
    content: id,
    mediaUrls: [],
    thumbnailUrls: [],
    mentionIds: [],
    state: 'SENT',
    chatType: 'PUBLIC',
    createdAt: '2026-01-03T10:00:00Z',
    updatedAt: '2026-01-03T10:00:00Z',
    sender: null,
    reactions: [],
    readReceipts: [],
  };
}

describe('ChatThreadController', () => {
  let controller: ChatThreadController;

  beforeEach(() => {
    controller = new ChatThreadController();
    vi.mocked(openThread).mockReset();
    vi.mocked(cancelAllForContext).mockClear();
    vi.mocked(reconcileThreadIndexOutboxForContext).mockClear();
    vi.mocked(enterContextAndMarkRead).mockClear();
    vi.mocked(markContextReadOnUserActivity).mockClear();
  });

  it('open → records thread key and opening phase', () => {
    const key = controller.open({
      contextType: 'USER',
      contextId: 'uc1',
    });
    expect(key).toBe('USER:uc1');
    expect(controller.getState().phase).toBe('opening');
    expect(controller.contextType()).toBe('USER');
    expect(controller.contextId()).toBe('uc1');
  });

  it('markOpenReady transitions to open with message count', () => {
    controller.open({ contextType: 'USER', contextId: 'uc1' });
    controller.markOpenReady(3);
    expect(controller.getState()).toMatchObject({ phase: 'open', messageCount: 3 });
  });

  it('markReadOnEnter delegates to enterContextAndMarkRead', () => {
    controller.markReadOnEnter({
      id: 'uc1',
      contextType: 'USER',
      userId: 'u1',
    });
    expect(enterContextAndMarkRead).toHaveBeenCalledWith(
      expect.objectContaining({ contextType: 'USER', contextId: 'uc1' })
    );
  });

  it('markRead delegates to markContextReadOnUserActivity', () => {
    controller.markRead({
      id: 'uc1',
      contextType: 'USER',
      userId: 'u1',
    });
    expect(markContextReadOnUserActivity).toHaveBeenCalledWith(
      expect.objectContaining({ contextType: 'USER', contextId: 'uc1' })
    );
  });

  it('close cancels sends and reconciles outbox once', () => {
    const ctx = { contextType: 'USER' as const, contextId: 'uc1' };
    controller.open(ctx);
    controller.close();
    expect(cancelAllForContext).toHaveBeenCalledTimes(1);
    expect(cancelAllForContext).toHaveBeenCalledWith('USER', 'uc1');
    expect(reconcileThreadIndexOutboxForContext).toHaveBeenCalledTimes(1);
    expect(reconcileThreadIndexOutboxForContext).toHaveBeenCalledWith('USER', 'uc1');
  });

  it('close resets state and returns prior context', () => {
    const ctx = { contextType: 'USER' as const, contextId: 'uc1' };
    controller.open(ctx);
    const closed = controller.close();
    expect(closed).toEqual(ctx);
    expect(controller.getState().phase).toBe('closed');
    expect(controller.getState().threadKey).toBeNull();
  });

  it('acceptsThreadKey matches active thread', () => {
    controller.open({ contextType: 'GAME', contextId: 'g1', chatType: 'PUBLIC' });
    expect(controller.acceptsThreadKey('GAME:g1:PUBLIC')).toBe(true);
    expect(controller.acceptsThreadKey('GAME:g1:PRIVATE')).toBe(false);
  });
});

describe('ChatThreadController open lifecycle (integration)', () => {
  beforeEach(() => {
    vi.mocked(openThread).mockReset();
    vi.mocked(enterContextAndMarkRead).mockClear();
  });

  it('open → bootstrap → markReadOnEnter → markOpenReady', async () => {
    const painted = [msg('m1'), msg('m2')];
    vi.mocked(openThread).mockResolvedValue({
      kind: 'painted',
      mergedPrev: painted,
      result: {
        kind: 'painted',
        plan: {
          messages: painted,
          scroll: { atBottom: true },
          scrollRow: undefined,
        },
        setMessagesSource: 'bootstrap-snapshot',
        scrollPlan: { scroll: { atBottom: true }, scrollRow: undefined },
      },
    });

    const controller = new ChatThreadController();
    controller.open({ contextType: 'USER', contextId: 'uc1' });

    controller.markReadOnEnter({
      id: 'uc1',
      contextType: 'USER',
      userId: 'u1',
    });
    expect(enterContextAndMarkRead).toHaveBeenCalledTimes(1);

    const outcome = await openThread({
      contextType: 'USER',
      contextId: 'uc1',
      chatType: 'PUBLIC',
      threadKey: 'USER:uc1',
      prev: [],
      peekL1: () => [],
    });

    expect(outcome.kind).toBe('painted');
    if (outcome.kind === 'painted') {
      const count = outcome.result.plan.messages.length;
      controller.markOpenReady(count);
      expect(controller.getState()).toMatchObject({
        phase: 'open',
        messageCount: 2,
        threadKey: 'USER:uc1',
      });
    }
  });
});
