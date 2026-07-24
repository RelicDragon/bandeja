import { registerPlugin, Capacitor } from '@capacitor/core';
import type { ChatContextType, ChatMessage } from '@/api/chat';
import { chatConversationKey } from '@/services/push/chatConversationKey';
import { useAuthStore } from '@/store/authStore';
import { getUserDisplayName } from '@/utils/messageMenuUtils';

interface ChatIntentBridgePlugin {
  donateMessageIntent(options: {
    direction: 'incoming' | 'outgoing';
    conversationIdentifier: string;
    messageId: string;
    body: string;
    senderId: string;
    senderName: string;
    senderAvatarUrl?: string;
  }): Promise<void>;
}

const ChatIntentBridge = registerPlugin<ChatIntentBridgePlugin>('ChatIntentBridge');

const REPLYABLE_CHAT_CONTEXT_TYPES = new Set<ChatContextType>(['USER', 'GAME', 'GROUP', 'BUG']);
const recentDonations = new Set<string>();
let recentDonationsClearTimer: ReturnType<typeof setTimeout> | null = null;

function rememberDonation(key: string): boolean {
  if (recentDonations.has(key)) return false;
  recentDonations.add(key);
  if (recentDonationsClearTimer) clearTimeout(recentDonationsClearTimer);
  recentDonationsClearTimer = setTimeout(() => {
    recentDonations.clear();
    recentDonationsClearTimer = null;
  }, 5000);
  return true;
}

function resolveSenderAvatarUrl(avatar: string | null | undefined): string | undefined {
  const text = (avatar ?? '').trim();
  if (!text.startsWith('http://') && !text.startsWith('https://')) return undefined;
  return text;
}

function messageBodyForIntent(message: ChatMessage): string {
  if (message.messageType === 'STICKER') {
    const emoji = message.stickerEmoji?.trim();
    return emoji ? `${emoji} Sticker` : 'Sticker';
  }
  if (message.messageType === 'VOICE') {
    return 'Voice message';
  }
  if (message.messageType === 'VIDEO') {
    return 'Video';
  }
  if (message.messageType === 'DOCUMENT') {
    return message.documentFileName?.trim() || 'File';
  }
  const text = message.content?.trim() ?? '';
  if (text) return text;
  if ((message.mediaUrls?.length ?? 0) > 0) return 'Photo';
  return '';
}

export function shouldDonateChatIntent(message: ChatMessage): boolean {
  if (!REPLYABLE_CHAT_CONTEXT_TYPES.has(message.chatContextType)) return false;
  if (!message.id) return false;
  if (message.storyReply) return false;
  return true;
}

async function donateChatIntent(direction: 'incoming' | 'outgoing', message: ChatMessage): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') return;
  if (!shouldDonateChatIntent(message)) return;
  if (!rememberDonation(`${direction}:${message.id}`)) return;

  const authUser = useAuthStore.getState().user;
  const sender =
    direction === 'outgoing'
      ? authUser
      : message.sender ?? (message.senderId ? { id: message.senderId, firstName: '', lastName: '' } : null);
  if (!sender?.id) return;

  const senderName =
    direction === 'outgoing'
      ? authUser
        ? getUserDisplayName(authUser)
        : 'Message'
      : message.sender
        ? getUserDisplayName(message.sender)
        : 'Message';

  try {
    await ChatIntentBridge.donateMessageIntent({
      direction,
      conversationIdentifier: chatConversationKey(
        message.chatContextType,
        message.contextId,
        message.chatType
      ),
      messageId: message.id,
      body: messageBodyForIntent(message),
      senderId: sender.id,
      senderName,
      senderAvatarUrl: resolveSenderAvatarUrl(
        direction === 'outgoing' ? authUser?.avatar : message.sender?.avatar
      ),
    });
  } catch (error) {
    console.warn('ChatIntentBridge: failed to donate chat intent', error);
  }
}

export function donateIncomingChatIntent(message: ChatMessage): void {
  void donateChatIntent('incoming', message);
}

export function donateOutgoingChatIntent(message: ChatMessage): void {
  void donateChatIntent('outgoing', message);
}
