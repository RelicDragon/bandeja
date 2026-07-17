import { registerPlugin, Capacitor } from '@capacitor/core';
import { useGameDetailsChromeStore } from '@/components/GameDetails/gameDetailsChromeStore';

interface ChatViewingBridgePlugin {
  setViewingChat(options: {
    userChatId?: string | null;
    groupChannelId?: string | null;
    gameChatId?: string | null;
    gameChatType?: string | null;
  }): Promise<void>;
  clearViewingChat(): Promise<void>;
}

const ChatViewingBridge = registerPlugin<ChatViewingBridgePlugin>('ChatViewingBridge');

let unsubscribe: (() => void) | null = null;

async function syncViewingToNative(): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return;
  const nav = useGameDetailsChromeStore.getState();
  try {
    await ChatViewingBridge.setViewingChat({
      userChatId: nav.viewingUserChatId,
      groupChannelId: nav.viewingGroupChannelId,
      gameChatId: nav.viewingGameChatId,
      gameChatType: nav.viewingGameChatChatType,
    });
  } catch (error) {
    console.warn('ChatViewingBridge: failed to sync viewing chat', error);
  }
}

/** Keep Android FCM handler in sync with the open chat so tray UI can be suppressed. */
export function initNativeChatViewingSync(): void {
  if (Capacitor.getPlatform() !== 'android' || unsubscribe) return;
  void syncViewingToNative();
  unsubscribe = useGameDetailsChromeStore.subscribe((state, prev) => {
    if (
      state.viewingUserChatId === prev.viewingUserChatId &&
      state.viewingGroupChannelId === prev.viewingGroupChannelId &&
      state.viewingGameChatId === prev.viewingGameChatId &&
      state.viewingGameChatChatType === prev.viewingGameChatChatType
    ) {
      return;
    }
    void syncViewingToNative();
  });
}

export function cleanupNativeChatViewingSync(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  if (Capacitor.getPlatform() !== 'android') return;
  void ChatViewingBridge.clearViewingChat().catch(() => {});
}
