import { Capacitor, registerPlugin } from '@capacitor/core';
import type { ChatContextType } from '@/api/chat';
import type { ChatType } from '@/types';
import { chatConversationKey } from '@/services/push/chatConversationKey';

interface ClearConversationNotificationPlugin {
  clearConversationNotification(options: { conversationKey: string }): Promise<void>;
}

const ChatViewingBridge = registerPlugin<ClearConversationNotificationPlugin>('ChatViewingBridge');
const BandejaPushDelegate = registerPlugin<ClearConversationNotificationPlugin>('BandejaPushDelegate');

async function clearConversationNotificationNative(conversationKey: string): Promise<void> {
  const platform = Capacitor.getPlatform();
  try {
    if (platform === 'android') {
      await ChatViewingBridge.clearConversationNotification({ conversationKey });
      return;
    }
    if (platform === 'ios') {
      await BandejaPushDelegate.clearConversationNotification({ conversationKey });
    }
  } catch (error) {
    console.warn('[push] failed to clear conversation notification', error);
  }
}

/** Drop tray notifications for a chat the user just opened / marked read. */
export function dismissNativeChatTrayNotification(params: {
  contextType: string;
  contextId: string;
  gameChatType?: ChatType | string | null;
  groupChannelId?: string | null;
  rawContextType?: string | null;
}): void {
  if (!Capacitor.isNativePlatform()) return;
  const raw = (params.rawContextType ?? params.contextType).toUpperCase();
  const keys = new Set<string>();

  if (raw === 'GAME') {
    keys.add(chatConversationKey('GAME', params.contextId, params.gameChatType));
  } else if (raw === 'USER') {
    keys.add(chatConversationKey('USER', params.contextId));
  } else if (raw === 'GROUP') {
    keys.add(chatConversationKey('GROUP', params.contextId));
  } else if (raw === 'BUG') {
    keys.add(chatConversationKey('BUG', params.contextId));
    if (params.groupChannelId) {
      keys.add(chatConversationKey('GROUP', params.groupChannelId));
    }
  } else if (
    params.contextType === 'GAME' ||
    params.contextType === 'USER' ||
    params.contextType === 'GROUP' ||
    params.contextType === 'BUG'
  ) {
    keys.add(
      chatConversationKey(
        params.contextType as ChatContextType,
        params.contextId,
        params.gameChatType
      )
    );
  }

  for (const conversationKey of keys) {
    void clearConversationNotificationNative(conversationKey);
  }
}
