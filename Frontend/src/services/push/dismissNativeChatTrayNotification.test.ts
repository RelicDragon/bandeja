import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  clearAndroid: vi.fn(async () => {}),
  clearIos: vi.fn(async () => {}),
  platform: 'android' as string,
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => mocks.platform === 'android' || mocks.platform === 'ios',
    getPlatform: () => mocks.platform,
  },
  registerPlugin: (name: string) => {
    if (name === 'ChatViewingBridge') {
      return { clearConversationNotification: mocks.clearAndroid };
    }
    return { clearConversationNotification: mocks.clearIos };
  },
}));

import { dismissNativeChatTrayNotification } from './dismissNativeChatTrayNotification';

describe('dismissNativeChatTrayNotification', () => {
  beforeEach(() => {
    mocks.clearAndroid.mockClear();
    mocks.clearIos.mockClear();
    mocks.platform = 'android';
  });

  it('clears android notification by conversation key', async () => {
    dismissNativeChatTrayNotification({ contextType: 'USER', contextId: 'chat-1' });
    await vi.waitFor(() => {
      expect(mocks.clearAndroid).toHaveBeenCalledWith({ conversationKey: 'user-chat:chat-1' });
    });
  });

  it('includes game chat type in key', async () => {
    dismissNativeChatTrayNotification({
      contextType: 'GAME',
      contextId: 'game-1',
      gameChatType: 'PRIVATE',
    });
    await vi.waitFor(() => {
      expect(mocks.clearAndroid).toHaveBeenCalledWith({
        conversationKey: 'game-chat:game-1:PRIVATE',
      });
    });
  });

  it('clears bug and optional group keys', async () => {
    dismissNativeChatTrayNotification({
      contextType: 'BUG',
      contextId: 'bug-1',
      groupChannelId: 'channel-1',
      rawContextType: 'BUG',
    });
    await vi.waitFor(() => {
      expect(mocks.clearAndroid).toHaveBeenCalledWith({ conversationKey: 'bug:bug-1' });
      expect(mocks.clearAndroid).toHaveBeenCalledWith({ conversationKey: 'group:channel-1' });
    });
  });

  it('uses ios bridge on ios', async () => {
    mocks.platform = 'ios';
    dismissNativeChatTrayNotification({ contextType: 'GROUP', contextId: 'g1' });
    await vi.waitFor(() => {
      expect(mocks.clearIos).toHaveBeenCalledWith({ conversationKey: 'group:g1' });
      expect(mocks.clearAndroid).not.toHaveBeenCalled();
    });
  });
});
