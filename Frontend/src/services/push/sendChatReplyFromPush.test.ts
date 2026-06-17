import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storage = new Map<string, string>();

const { createMessage, confirmMessageReceipt, schedule, getStatus, getTokenNative, apiPost } = vi.hoisted(() => ({
  createMessage: vi.fn(),
  confirmMessageReceipt: vi.fn(),
  schedule: vi.fn(),
  getStatus: vi.fn(),
  getTokenNative: vi.fn(),
  apiPost: vi.fn(),
}));

vi.mock('@/api/chat', () => ({
  chatApi: {
    createMessage: (...args: unknown[]) => createMessage(...args),
    confirmMessageReceipt: (...args: unknown[]) => confirmMessageReceipt(...args),
  },
}));

vi.mock('@/api/axios', () => ({
  default: {
    post: (...args: unknown[]) => apiPost(...args),
  },
}));

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    schedule: (...args: unknown[]) => schedule(...args),
  },
}));

vi.mock('@capacitor/network', () => ({
  Network: {
    getStatus: (...args: unknown[]) => getStatus(...args),
  },
}));

vi.mock('@/services/authBridge', () => ({
  getTokenNative: (...args: unknown[]) => getTokenNative(...args),
}));

vi.mock('@/utils/authPersistence', () => ({
  restoreAuthIfNeeded: vi.fn(),
}));

vi.mock('@/utils/networkStatus', () => ({
  useNetworkStore: {
    getState: () => ({ isOnline: true }),
  },
}));

vi.mock('@/store/authStore', () => ({
  useAuthStore: {
    getState: () => ({
      user: { id: 'user-1', nameIsSet: true },
      setToken: vi.fn(),
    }),
  },
}));

vi.mock('./markPushReplyContextAsRead', () => ({
  markPushReplyContextAsRead: vi.fn(),
}));

vi.mock('./syncAppBadgeAfterPushReply', () => ({
  syncAppBadgeAfterPushReply: vi.fn(async () => {}),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: () => 'ios',
    isNativePlatform: () => true,
  },
}));

import {
  PUSH_REPLY_MAX_CONTENT_LENGTH,
  truncatePushReplyContent,
  sendChatReplyFromPush,
} from './sendChatReplyFromPush';
import type { PushChatContext } from './parsePushChatContext';

const ctx: PushChatContext = {
  type: 'USER_CHAT',
  chatContextType: 'USER',
  contextId: 'chat-1',
  messageId: 'msg-1',
  userChatId: 'chat-1',
};

describe('truncatePushReplyContent', () => {
  it('returns content unchanged when within limit', () => {
    const text = 'a'.repeat(100);
    expect(truncatePushReplyContent(text)).toBe(text);
    expect(truncatePushReplyContent(text).length).toBe(100);
  });

  it('truncates content to 4096 characters', () => {
    const text = 'x'.repeat(5000);
    const result = truncatePushReplyContent(text);
    expect(result.length).toBe(PUSH_REPLY_MAX_CONTENT_LENGTH);
    expect(result).toBe('x'.repeat(PUSH_REPLY_MAX_CONTENT_LENGTH));
  });
});

describe('sendChatReplyFromPush', () => {
  beforeEach(() => {
    storage.clear();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
    });
    createMessage.mockReset();
    confirmMessageReceipt.mockReset();
    schedule.mockReset();
    getStatus.mockReset();
    getTokenNative.mockReset();
    apiPost.mockReset();
    localStorage.setItem('token', 'jwt');
    getStatus.mockResolvedValue({ connected: true });
    createMessage.mockResolvedValue({ id: 'new-msg' });
    confirmMessageReceipt.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    storage.clear();
    vi.unstubAllGlobals();
  });

  it('sends truncated content via createMessage', async () => {
    const longText = 'y'.repeat(5000);
    await sendChatReplyFromPush(ctx, longText);

    expect(createMessage).toHaveBeenCalledTimes(1);
    const request = createMessage.mock.calls[0][0];
    expect(request.content.length).toBe(PUSH_REPLY_MAX_CONTENT_LENGTH);
    expect(request.replyToId).toBe('msg-1');
    expect(request.clientMutationId).toMatch(/^push-reply-msg-msg-1-[0-9a-f]{16}$/);
    expect(request.clientMutationId).not.toContain(':');
    expect(confirmMessageReceipt).toHaveBeenCalledWith('msg-1', 'push');
    expect(schedule).not.toHaveBeenCalled();
  });

  it('schedules local notification when offline', async () => {
    getStatus.mockResolvedValue({ connected: false });
    await sendChatReplyFromPush(ctx, 'hello');

    expect(createMessage).not.toHaveBeenCalled();
    expect(schedule).toHaveBeenCalledTimes(1);
  });

  it('sends via push-reply token path without JWT confirm', async () => {
    const tokenCtx: PushChatContext = { ...ctx, replyToken: 'rtok-test' };
    apiPost.mockResolvedValue({ data: { success: true, unreadBadgeCount: 3 } });
    storage.delete('token');

    const ok = await sendChatReplyFromPush(tokenCtx, 'hello from push');

    expect(ok).toBe(true);
    expect(apiPost).toHaveBeenCalledWith('/chat/push-reply', expect.objectContaining({
      replyToken: 'rtok-test',
      content: 'hello from push',
      clientMutationId: expect.stringMatching(/^push-reply-token-[0-9a-f]{48}$/),
    }));
    expect(createMessage).not.toHaveBeenCalled();
    expect(confirmMessageReceipt).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
  });

  it('dedupes concurrent identical push replies', async () => {
    const tokenCtx: PushChatContext = { ...ctx, replyToken: 'rtok-dedupe' };
    apiPost.mockResolvedValue({ data: { success: true } });

    await Promise.all([
      sendChatReplyFromPush(tokenCtx, 'same text'),
      sendChatReplyFromPush(tokenCtx, 'same text'),
    ]);

    expect(apiPost).toHaveBeenCalledTimes(1);
  });
});
